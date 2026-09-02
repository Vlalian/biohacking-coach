import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { events, sessions } from '@/db/schema';
import { isValidDateKey } from '@/lib/date';
import { getActiveLink } from './coach-repository';
import {
  canHeadCoachEditContent,
  canHeadCoachMove,
  HEAD_COACH_ORIGIN,
} from './head-coach-authority';
import { applyMove, type MoveResult } from '@/features/session/session-move';
import { casDeleteSession, casUpdateSession } from '@/features/session/versioned-write';
import type { SessionConflict } from '@/features/session/conflict';

/**
 * The Head Coach acts on a linked athlete's plan — add, edit, delete — under
 * server authority (ADR 0003, ADR 0006).
 *
 * Every action passes the same two gates before it writes:
 *
 *   1. **The link gate.** The acting Head Coach is a coach id resolved upstream
 *      from the authenticated session; this module proves an *active* Coaching
 *      Link joins them to the athlete. No link — none, or severed — refuses, so
 *      a Head Coach cannot act on an athlete they are not linked to, and a
 *      forged athlete id finds no link (ticket 12).
 *   2. **The content gate** (edit/delete only). The target session's `origin`
 *      must be within the Head Coach's content authority — the Coach's drafts or
 *      their own prescriptions, never an Athlete Session or a Garmin import
 *      ({@link canHeadCoachEditContent}).
 *
 * Each action writes the session change and a `head_coach`-attributed event in
 * one transaction: both land or neither does. The event records with
 * `actor_type: head_coach` and the actor's id, and `narrated_at` starts null —
 * which now means *not yet announced* rather than *never announced*:
 * `narration-service` un-benched the announcement half (`coached-mode/03`), so
 * the athlete is told on their next app-open. This module still writes only the
 * audit half; it does not narrate, and nothing here changed when narration
 * landed.
 *
 * (Until 2026-08-21 this comment said narration "stays benched … nothing is
 * announced to the athlete", which stopped being true when `coached-mode/03`
 * shipped. Corrected rather than deleted, per `AGENTS.md`: this is the comment
 * a reader of the write path trusts.)
 *
 * Head-Coach-authored content is never silently modified by the Coach or its
 * automation, because the only write path to a `head_coach` session is this
 * module — reached only by an authenticated, linked Head Coach — and no
 * automation calls it. Week Rebalancing, when it exists, may only *suggest*.
 */

export type HeadCoachActionResult =
  | { ok: true; sessionId: string }
  | {
      ok: false;
      reason: 'not-linked' | 'invalid' | 'not-found' | 'wrong-athlete' | 'forbidden-origin';
    }
  // The athlete writes these rows too, so an edit can lose a race. The refusal
  // carries what won, because the Head Coach has no other way to find out.
  | { ok: false; reason: 'conflict'; conflict: SessionConflict };

/** The mutable fields of a session the Head Coach may set. */
export type PrescriptionInput = {
  date: string;
  type: string;
  duration?: number | null;
  zone?: string | null;
  title?: string | null;
  note?: string | null;
  isTraining?: boolean;
};

function isValidPrescription(input: PrescriptionInput): boolean {
  return (
    isValidDateKey(input.date) &&
    typeof input.type === 'string' &&
    input.type.trim().length > 0
  );
}

/**
 * The shared content gate for editing or deleting an existing session: it must
 * exist, belong to the linked athlete, and be within the Head Coach's content
 * authority. Returns the target row's audit fields on success, or the refusal
 * that stopped it — so edit and delete run the same checks in the same order
 * and cannot drift apart. The link gate is the caller's own line, kept explicit
 * so the authorization step reads at each call site.
 */
async function loadEditableSession(
  athleteId: string,
  sessionId: string,
): Promise<
  | { ok: true; origin: string; date: string; version: number }
  | { ok: false; reason: 'not-found' | 'wrong-athlete' | 'forbidden-origin' }
> {
  const [row] = await getDb()
    .select({
      athleteId: sessions.athleteId,
      origin: sessions.origin,
      date: sessions.date,
      version: sessions.version,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return { ok: false, reason: 'not-found' };
  // The session must belong to the athlete the link is for — a valid link
  // cannot be paired with a foreign session id to reach across athletes.
  if (row.athleteId !== athleteId) return { ok: false, reason: 'wrong-athlete' };
  if (!canHeadCoachEditContent(row.origin)) return { ok: false, reason: 'forbidden-origin' };

  return { ok: true, origin: row.origin, date: row.date, version: row.version };
}

/** Normalises the optional fields into the column set, shared by add and edit. */
function contentColumns(input: PrescriptionInput) {
  return {
    date: input.date,
    type: input.type.trim(),
    duration: input.duration ?? null,
    zone: input.zone ?? null,
    title: input.title ?? null,
    note: input.note ?? null,
    isTraining: input.isTraining ?? true,
  };
}

/**
 * Adds a Prescribed Session (`origin: 'head_coach'`) to a linked athlete's plan.
 */
export async function prescribeSession(params: {
  headCoachId: string;
  athleteId: string;
  input: PrescriptionInput;
}): Promise<HeadCoachActionResult> {
  const { headCoachId, athleteId, input } = params;

  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };
  if (!isValidPrescription(input)) return { ok: false, reason: 'invalid' };

  const db = getDb();
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(sessions).values({
      id,
      athleteId,
      origin: HEAD_COACH_ORIGIN,
      status: 'planned',
      dayOrder: 0,
      ...contentColumns(input),
    }),
    db.insert(events).values({
      athleteId,
      actorType: 'head_coach',
      actorId: headCoachId,
      type: 'session_prescribed',
      payload: { sessionId: id, ...contentColumns(input) },
    }),
  ]);

  return { ok: true, sessionId: id };
}

/**
 * Edits a session on a linked athlete's plan, if its content is the Head
 * Coach's to edit.
 */
export async function editPrescribedSession(params: {
  headCoachId: string;
  athleteId: string;
  sessionId: string;
  input: PrescriptionInput;
  /**
   * The version the coach's editor was showing — not a version read here.
   * Reading it fresh would make the check pass by construction and restore the
   * last-write-wins behaviour this exists to remove; the guard is only worth
   * anything if the number comes from what the writer actually saw.
   */
  expectedVersion: number;
}): Promise<HeadCoachActionResult> {
  const { headCoachId, athleteId, sessionId, input, expectedVersion } = params;

  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };
  if (!isValidPrescription(input)) return { ok: false, reason: 'invalid' };

  const target = await loadEditableSession(athleteId, sessionId);
  if (!target.ok) return target;

  const columns = contentColumns(input);
  const written = await casUpdateSession({
    athleteId,
    sessionId,
    expectedVersion,
    set: columns,
    attempted: {
      date: columns.date,
      type: columns.type,
      duration: columns.duration === null ? null : String(columns.duration),
      zone: columns.zone,
      title: columns.title,
      note: columns.note,
    },
    event: {
      actorType: 'head_coach',
      actorId: headCoachId,
      type: 'session_edited',
      payload: { sessionId, from: { date: target.date }, to: columns },
    },
  });

  return written.ok ? { ok: true, sessionId } : written;
}

/**
 * Deletes a session from a linked athlete's plan, if its content is the Head
 * Coach's to delete.
 */
export async function deletePrescribedSession(params: {
  headCoachId: string;
  athleteId: string;
  sessionId: string;
  /** As for {@link editPrescribedSession}: the version the coach was shown, so
   *  a delete cannot discard an edit that landed while they were deciding. */
  expectedVersion: number;
}): Promise<HeadCoachActionResult> {
  const { headCoachId, athleteId, sessionId, expectedVersion } = params;

  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };

  const target = await loadEditableSession(athleteId, sessionId);
  if (!target.ok) return target;

  const written = await casDeleteSession({
    athleteId,
    sessionId,
    expectedVersion,
    event: {
      actorType: 'head_coach',
      actorId: headCoachId,
      type: 'session_deleted',
      payload: { sessionId, date: target.date, origin: target.origin },
    },
  });

  return written.ok ? { ok: true, sessionId } : written;
}

/**
 * The Head Coach moving a session on a linked athlete's plan (ADR 0003,
 * 2026-08-21 amendment — placement is shared, not transferred).
 *
 * Two gates before anything is written, the same shape as every other action
 * here: the Coaching Link must be active, and the session's origin must be
 * within the coach's placement authority — an Athlete Session is not.
 *
 * The Move rules themselves are NOT re-implemented for the coach. This delegates
 * to {@link applyMove}, the same function the athlete's own move runs through,
 * so "no moving into the past", "not across the week boundary" and "a completed
 * session is frozen" cannot mean one thing for the athlete and another for their
 * coach. What differs is only the actor recorded on the `session_moved` event —
 * which is what will let narration tell the athlete who moved their training.
 */
export async function moveSessionAsHeadCoach(params: {
  headCoachId: string;
  athleteId: string;
  sessionId: string;
  targetDate: string;
  today: string;
  /**
   * The version the coach's browser read. A coach move is a contested write by
   * definition — the athlete may be dragging the same session — so it carries a
   * version like every other write in FR-5 rather than being the one path that
   * still wins by arriving last.
   */
  expectedVersion: number;
}): Promise<MoveResult | { ok: false; reason: 'not-linked' }> {
  const { headCoachId, athleteId, sessionId, targetDate, today, expectedVersion } = params;

  if (!isValidDateKey(targetDate)) return { ok: false, reason: 'bounce' };

  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };

  return applyMove({
    athleteId,
    sessionId,
    targetDate,
    today,
    expectedVersion,
    actor: { type: 'head_coach', headCoachId },
    permittedOrigin: canHeadCoachMove,
  });
}
