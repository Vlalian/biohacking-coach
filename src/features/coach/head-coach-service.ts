import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { events, sessions } from '@/db/schema';
import { isValidDateKey } from '@/lib/date';
import { getActiveLink } from './coach-repository';
import { canHeadCoachEditContent, canHeadCoachMove } from './head-coach-authority';
import { applyMove, type MoveResult } from '@/features/session/session-move';
import { isFrozen } from '@/features/session/move-rules';
import { casDeleteSession, casUpdateSession } from '@/features/session/versioned-write';
import type { SessionConflict } from '@/features/session/conflict';
import { prescribedSessionOf, prescriptionColumns, type PrescriptionInput } from './prescription';
import type { Session } from '@/features/session/session';

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
  // What the write left, so the calendar shows it without a reload
  // (showable-version/44): an add returns the session, an edit its version, and
  // a delete has nothing to report.
  | { ok: true; sessionId: string; version?: number; session?: Session }
  | {
      ok: false;
      reason:
        | 'not-linked'
        | 'invalid'
        | 'not-found'
        | 'wrong-athlete'
        | 'forbidden-origin'
        // The record is immutable for everyone. Content editing did not check this
        // until 2026-09-04; Session Move always has.
        | 'frozen';
    }
  // The athlete writes these rows too, so an edit can lose a race. The refusal
  // carries what won, because the Head Coach has no other way to find out.
  | { ok: false; reason: 'conflict'; conflict: SessionConflict };

export type { PrescriptionInput };

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
  /** The server's clock, passed in like the move path's — never `new Date()`
   *  here, or the rule stops being judged against the server. */
  today: string,
): Promise<
  | { ok: true; origin: string; date: string; version: number }
  | { ok: false; reason: 'not-found' | 'wrong-athlete' | 'forbidden-origin' | 'frozen' }
> {
  const [row] = await getDb()
    .select({
      athleteId: sessions.athleteId,
      origin: sessions.origin,
      date: sessions.date,
      // Added to the existing select rather than read separately: a value
      // fetched fresh for its own check makes that check pass by construction,
      // which is the trap the `expectedVersion` comment below describes.
      status: sessions.status,
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
  // Origin first, deliberately: an Athlete Session is refused as "not yours"
  // rather than "too late", because that is the more fundamental answer and it
  // is the ordering `drawer-policy.ts` already gives the coach on screen.
  //
  // `isFrozen` rather than a second rule. It is what Session Move asks, so
  // "a completed session is frozen" cannot mean one thing for placement and
  // another for content — the same argument the move path makes in its own
  // comment below.
  if (isFrozen({ date: row.date, status: row.status }, today)) {
    return { ok: false, reason: 'frozen' };
  }

  return { ok: true, origin: row.origin, date: row.date, version: row.version };
}

/**
 * Whether a day is in a week that is already closed, and so cannot receive a
 * session — asked about the *destination*, where a session is being put.
 *
 * The counterpart to asking whether an existing row may be touched. Both
 * callers need it: creating names a day directly, and editing can move one, so
 * a session could otherwise be walked into a closed week and land frozen with
 * nobody able to edit, delete or move it again.
 *
 * Each caller asks it for itself rather than `loadEditableSession` folding it
 * in. Folding was tried and reverted: it moved the extra branch onto a function
 * that was clean at CRAP 5 and pushed it over the ceiling, while the function
 * it relieved was already over and already carried in `code-health/11`. That is
 * moving a number, not improving anything.
 *
 * Asked of `isFrozen` rather than re-derived, so "this week is over" means one
 * thing across creation, content and placement.
 */
function landsInAClosedWeek(date: string, today: string): boolean {
  // Stryker disable next-line StringLiteral — equivalent. `isFrozen` reads
  // status only as `=== 'completed'`, and the row this asks about is being
  // written as `planned`, so every other string it could be mutated to yields
  // the same verdict. The literal says what is being asked, not the answer.
  return isFrozen({ date, status: 'planned' }, today);
}

/**
 * Adds a Prescribed Session (`origin: 'head_coach'`) to a linked athlete's plan.
 *
 * `today` is the server's day, never the browser's — the same rule the edit and
 * move paths follow, for the same reason: whether a week is closed must not be
 * judged against a clock the client controls.
 */
export async function prescribeSession(params: {
  headCoachId: string;
  athleteId: string;
  input: PrescriptionInput;
  today: string;
}): Promise<HeadCoachActionResult> {
  const { headCoachId, athleteId, input, today } = params;

  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };
  if (!isValidPrescription(input)) return { ok: false, reason: 'invalid' };
  // Creating into a closed week is refused, like editing and deleting in one
  // (`showable-version/22`, decided 2026-09-08). Asked of `isFrozen` rather
  // than re-derived, so "this week is over" cannot mean one thing for creation
  // and another for content. The row would be `planned`, so only the date can
  // freeze it — but the question is still `isFrozen`'s to answer.
  if (landsInAClosedWeek(input.date, today)) return { ok: false, reason: 'frozen' };

  const db = getDb();
  const id = crypto.randomUUID();
  // The row written and the session returned are one value, so the calendar's
  // instant copy (prescribedSessionOf) and the database cannot differ.
  // Version 1 is the column's default: a new row has never been rewritten.
  const session = prescribedSessionOf(id, input, 1);
  await db.batch([
    db.insert(sessions).values({ athleteId, ...session }),
    db.insert(events).values({
      athleteId,
      actorType: 'head_coach',
      actorId: headCoachId,
      type: 'session_prescribed',
      payload: { sessionId: id, ...prescriptionColumns(input) },
    }),
  ]);

  return { ok: true, sessionId: id, session };
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
  /** The server's clock. The record is immutable, and that is judged here
   *  rather than in the browser (ADR 0006). */
  today: string;
}): Promise<HeadCoachActionResult> {
  const { headCoachId, athleteId, sessionId, input, expectedVersion, today } = params;

  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };
  if (!isValidPrescription(input)) return { ok: false, reason: 'invalid' };

  const target = await loadEditableSession(athleteId, sessionId, today);
  if (!target.ok) return target;
  // The stored row being editable is not enough. The edit sets a new date, so
  // a live current-week session could be walked into a closed week and land
  // frozen — nobody able to edit, delete or move it again, the state the create
  // guard exists to prevent, reached by another verb. CodeRabbit, PR #57.
  //
  // Deliberately here and not folded into `loadEditableSession`: folding it
  // moved this branch onto a function that was clean at CRAP 5 and pushed it
  // over the ceiling, which is moving a number rather than improving anything.
  if (landsInAClosedWeek(input.date, today)) return { ok: false, reason: 'frozen' };

  const columns = prescriptionColumns(input);
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

  return written.ok ? { ok: true, sessionId, version: written.version } : written;
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
  /** The server's clock. The record is immutable, and that is judged here
   *  rather than in the browser (ADR 0006). */
  today: string;
}): Promise<HeadCoachActionResult> {
  const { headCoachId, athleteId, sessionId, expectedVersion, today } = params;

  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };

  const target = await loadEditableSession(athleteId, sessionId, today);
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
