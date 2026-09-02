import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, events } from '@/db/schema';
import { getSessionAuthority } from './session-repository';
import { createdStatusFor, validateAthleteSessionDraft } from './athlete-session-rules';
import { casDeleteSession, casUpdateSession } from './versioned-write';
import type { SessionConflict } from './conflict';

/**
 * The Athlete Session adapter: reads, writes, and nothing else.
 *
 * What counts as a legal type, duration or note, and which status a retro-log
 * lands in, are decided by `athlete-session-rules.ts` — framework-free and
 * tested without a database (AGENTS.md: pure core, I/O at the edges).
 */

export type CreateAthleteSessionResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: 'invalid' };

/**
 * Creates an Athlete Session — the athlete's own entry, distinct from a
 * Coach-planned or Head-Coach-prescribed session (CONTEXT.md: "the Coach owns
 * training load; Athlete Sessions are extras on top").
 *
 * Retro-logging: creating on a day at or before `today` lands the session
 * already `completed` — "the session is created as already completed (done
 * but forgotten)... there is no deadline on recording reality." A future or
 * today-not-yet-happened entry lands `planned`.
 */
export async function createAthleteSession(params: {
  athleteId: string;
  date: string;
  type: string;
  durationMin: number | null;
  isTraining: boolean;
  note: string | null;
  today: string;
}): Promise<CreateAthleteSessionResult> {
  const { athleteId, date, type, durationMin, isTraining, note, today } = params;

  const validated = validateAthleteSessionDraft({ type, durationMin, isTraining, note });
  if (!validated.ok) return validated;
  const { draft } = validated;

  const db = getDb();

  const [row] = await db
    .insert(sessions)
    .values({
      athleteId,
      date,
      type: draft.type,
      origin: 'athlete',
      status: createdStatusFor(date, today),
      isTraining: draft.isTraining,
      duration: draft.durationMin,
      note: draft.note,
      // Allocated in the INSERT itself, not by counting first: a select-then-
      // insert races, and two sessions added to the same day at once would both
      // read the same count and land on the same dayOrder — which is the column
      // the calendar orders a Double by. Computed in the statement, the second
      // insert sees the first.
      dayOrder: sql`(
        SELECT COALESCE(MAX(${sessions.dayOrder}) + 1, 0)
        FROM ${sessions}
        WHERE ${sessions.athleteId} = ${athleteId} AND ${sessions.date} = ${date}
      )`,
    })
    .returning({ id: sessions.id });

  await db.insert(events).values({
    athleteId,
    actorType: 'athlete',
    actorId: athleteId,
    type: 'athlete_session_created',
    payload: { sessionId: row.id, date, type },
  });

  return { ok: true, sessionId: row.id };
}

export type AthleteSessionWriteResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'not-athlete-authored' | 'invalid' }
  | { ok: false; reason: 'conflict'; conflict: SessionConflict };

async function loadOwnedAthleteSession(sessionId: string, athleteId: string) {
  const row = await getSessionAuthority(sessionId);

  if (!row) return { ok: false as const, reason: 'not-found' as const };
  if (row.athleteId !== athleteId) return { ok: false as const, reason: 'not-owner' as const };
  // Content ownership: the athlete owns *placement* of every session, but only
  // *content* of their own (CONTEXT.md, Prescribed Session) — a Coach-planned
  // or Head-Coach-prescribed session's note/type/duration is read-only here.
  if (row.origin !== 'athlete')
    return { ok: false as const, reason: 'not-athlete-authored' as const };
  return { ok: true as const };
}

/** Edits an Athlete Session's own fields — never its placement (that's Session Move). */
export async function updateAthleteSession(params: {
  athleteId: string;
  sessionId: string;
  type: string;
  durationMin: number | null;
  isTraining: boolean;
  note: string | null;
  expectedVersion: number;
}): Promise<AthleteSessionWriteResult> {
  const { athleteId, sessionId, type, durationMin, isTraining, note, expectedVersion } = params;

  const found = await loadOwnedAthleteSession(sessionId, athleteId);
  if (!found.ok) return found;

  const validated = validateAthleteSessionDraft({ type, durationMin, isTraining, note });
  if (!validated.ok) return validated;
  const { draft } = validated;

  // Ownership and version both travel with the write, not just the read above:
  // the read and the write are separate statements, so a guard left behind in
  // the read guards nothing.
  return casUpdateSession({
    athleteId,
    sessionId,
    expectedVersion,
    set: {
      type: draft.type,
      duration: draft.durationMin,
      isTraining: draft.isTraining,
      note: draft.note,
    },
    attempted: {
      type: draft.type,
      duration: draft.durationMin === null ? null : String(draft.durationMin),
      note: draft.note,
      // Set above, so it has to be comparable here too: an edit that toggles
      // only this reported no divergence, which reads as "already done".
      isTraining: String(draft.isTraining),
    },
    // No event: an Athlete Session edit has never logged one, and adding a new
    // event type here would put a row in the activity feed that nothing reads.
  });
}

export async function deleteAthleteSession(params: {
  athleteId: string;
  sessionId: string;
  expectedVersion: number;
}): Promise<AthleteSessionWriteResult> {
  const { athleteId, sessionId, expectedVersion } = params;

  const found = await loadOwnedAthleteSession(sessionId, athleteId);
  if (!found.ok) return found;

  return casDeleteSession({
    athleteId,
    sessionId,
    expectedVersion,
    event: {
      actorType: 'athlete',
      actorId: athleteId,
      type: 'athlete_session_deleted',
      payload: { sessionId },
    },
  });
}
