import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, events } from '@/db/schema';
import { isFrozen } from './move-rules';

export type SessionStatusResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'frozen' | 'future' };

async function loadOwnedSession(sessionId: string, athleteId: string) {
  const [row] = await getDb()
    .select({
      athleteId: sessions.athleteId,
      date: sessions.date,
      status: sessions.status,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return { ok: false as const, reason: 'not-found' as const };
  if (row.athleteId !== athleteId) return { ok: false as const, reason: 'not-owner' as const };
  return { ok: true as const, row };
}

/**
 * Marks a session complete under server authority (ADR 0006) — the manual
 * "Mark complete" fallback for sessions Detected Activity can't see (pool
 * swims, strength, mobility). One-directional: there is no undo-complete
 * control, matching the Session Drawer (a completed session offers Skip and
 * Unavailable, never a way back to planned).
 *
 * Refuses a session already frozen (completed, or in a past week — ADR 0002)
 * and a session dated after `today`: nothing in the future is "done" yet.
 */
export async function completeSession(params: {
  athleteId: string;
  sessionId: string;
  today: string;
}): Promise<SessionStatusResult> {
  const { athleteId, sessionId, today } = params;
  const found = await loadOwnedSession(sessionId, athleteId);
  if (!found.ok) return found;

  if (isFrozen({ date: found.row.date, status: found.row.status }, today)) {
    return { ok: false, reason: 'frozen' };
  }
  if (found.row.date > today) return { ok: false, reason: 'future' };

  await getDb().batch([
    getDb()
      .update(sessions)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(sessions.id, sessionId)),
    getDb().insert(events).values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: 'session_completed',
      payload: { sessionId },
    }),
  ]);

  return { ok: true };
}

/**
 * Toggles Skipped ↔ Planned under server authority. A skip needs no
 * explanation (US-3) — context is gathered at the next Weekly Session, not in
 * the moment. Refuses a frozen session (ADR 0002): the training record is
 * immutable once a week has passed, and a completed session cannot un-happen.
 */
export async function toggleSkipSession(params: {
  athleteId: string;
  sessionId: string;
  today: string;
}): Promise<SessionStatusResult> {
  const { athleteId, sessionId, today } = params;
  const found = await loadOwnedSession(sessionId, athleteId);
  if (!found.ok) return found;

  if (isFrozen({ date: found.row.date, status: found.row.status }, today)) {
    return { ok: false, reason: 'frozen' };
  }

  const nextStatus = found.row.status === 'skipped' ? 'planned' : 'skipped';
  await getDb().batch([
    getDb()
      .update(sessions)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId)),
    getDb().insert(events).values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: nextStatus === 'skipped' ? 'session_skipped' : 'session_skip_undone',
      payload: { sessionId },
    }),
  ]);

  return { ok: true };
}

/**
 * Toggles Unavailable ↔ Planned under server authority — the Session Drawer's
 * direct route to the session-level Unavailable state (distinct from an
 * Unavailable *Date*, which availability-actions.ts covers). `parked` mirrors
 * `status` so the calendar's dashed-dot affordance and Session Move's "a
 * parked session doesn't drag" rule both read one flag. Refuses a frozen
 * session, same as skip.
 */
export async function toggleUnavailableSession(params: {
  athleteId: string;
  sessionId: string;
  today: string;
}): Promise<SessionStatusResult> {
  const { athleteId, sessionId, today } = params;
  const found = await loadOwnedSession(sessionId, athleteId);
  if (!found.ok) return found;

  if (isFrozen({ date: found.row.date, status: found.row.status }, today)) {
    return { ok: false, reason: 'frozen' };
  }

  const makingUnavailable = found.row.status !== 'unavailable';
  const nextStatus = makingUnavailable ? 'unavailable' : 'planned';
  await getDb().batch([
    getDb()
      .update(sessions)
      .set({ status: nextStatus, parked: makingUnavailable, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId)),
    getDb().insert(events).values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: makingUnavailable ? 'session_marked_unavailable' : 'session_unavailable_undone',
      payload: { sessionId },
    }),
  ]);

  return { ok: true };
}
