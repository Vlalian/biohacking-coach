import { and, count, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, events } from '@/db/schema';
import { getSessionAuthority } from './session-repository';

/** The Athlete Session types (CONTEXT.md): Mobility and Other coexist with
 *  Rest; Strength and Other-as-training follow the training rules. */
const ATHLETE_SESSION_TYPES = ['Mobility', 'Strength', 'Other'] as const;
const NOTE_MAX = 500;

function isValidType(type: unknown): type is (typeof ATHLETE_SESSION_TYPES)[number] {
  return typeof type === 'string' && (ATHLETE_SESSION_TYPES as readonly string[]).includes(type);
}

function isValidDuration(duration: unknown): duration is number | null {
  return duration === null || (Number.isInteger(duration) && (duration as number) > 0);
}

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

  if (!isValidType(type)) return { ok: false, reason: 'invalid' };
  if (!isValidDuration(durationMin)) return { ok: false, reason: 'invalid' };

  const trimmedNote = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : null;

  const db = getDb();
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(sessions)
    .where(and(eq(sessions.athleteId, athleteId), eq(sessions.date, date)));

  const [row] = await db
    .insert(sessions)
    .values({
      athleteId,
      date,
      type,
      origin: 'athlete',
      status: date <= today ? 'completed' : 'planned',
      isTraining,
      duration: durationMin,
      note: trimmedNote || null,
      dayOrder: existing,
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
  | { ok: false; reason: 'not-found' | 'not-owner' | 'not-athlete-authored' | 'invalid' };

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
}): Promise<AthleteSessionWriteResult> {
  const { athleteId, sessionId, type, durationMin, isTraining, note } = params;

  const found = await loadOwnedAthleteSession(sessionId, athleteId);
  if (!found.ok) return found;

  if (!isValidType(type)) return { ok: false, reason: 'invalid' };
  if (!isValidDuration(durationMin)) return { ok: false, reason: 'invalid' };
  const trimmedNote = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : null;

  await getDb()
    .update(sessions)
    .set({
      type,
      duration: durationMin,
      isTraining,
      note: trimmedNote || null,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  return { ok: true };
}

export async function deleteAthleteSession(params: {
  athleteId: string;
  sessionId: string;
}): Promise<AthleteSessionWriteResult> {
  const { athleteId, sessionId } = params;

  const found = await loadOwnedAthleteSession(sessionId, athleteId);
  if (!found.ok) return found;

  const db = getDb();
  await db.batch([
    db.delete(sessions).where(eq(sessions.id, sessionId)),
    db.insert(events).values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: 'athlete_session_deleted',
      payload: { sessionId },
    }),
  ]);

  return { ok: true };
}
