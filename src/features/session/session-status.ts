import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, events } from '@/db/schema';
import { isFrozen } from './move-rules';
import { getSessionAuthority } from './session-repository';
import {
  completeTransition,
  isFutureDated,
  skipTransition,
  unavailableTransition,
  type SessionStatusTransition,
} from './session-status-rules';

/**
 * The Session status adapter: reads, writes, and nothing else.
 *
 * Which status a toggle lands in and what event it records are decided by
 * `session-status-rules.ts`; whether a session is frozen is decided by
 * `isFrozen` in `move-rules.ts` (ADR 0002). Both are framework-free, so the
 * semantics are tested without a database (AGENTS.md: pure core, I/O at the
 * edges) and this module is left with the I/O.
 */

export type SessionStatusResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'frozen' | 'future' | 'conflict' };

async function loadOwnedSession(sessionId: string, athleteId: string) {
  const row = await getSessionAuthority(sessionId);

  if (!row) return { ok: false as const, reason: 'not-found' as const };
  if (row.athleteId !== athleteId) return { ok: false as const, reason: 'not-owner' as const };
  return { ok: true as const, row };
}

/**
 * Applies a decided transition, but only if the session is still in the state
 * it was read in.
 *
 * The status was read in one statement and is written in another, so between
 * them the session can change — a second tab, or a double-tap that fires twice.
 * `expectedStatus` in the WHERE makes the write conditional: the update either
 * finds the row as expected and applies, or matches nothing and reports a
 * conflict. Without it, two concurrent toggles both read 'planned' and both
 * write 'skipped', and one of them silently did nothing while reporting success.
 *
 * Ownership rides in the same WHERE for the same reason — the check above is a
 * separate statement, so the guarantee has to travel with the write.
 */
async function applyTransition(params: {
  athleteId: string;
  sessionId: string;
  expectedStatus: string;
  transition: SessionStatusTransition;
}): Promise<SessionStatusResult> {
  const { athleteId, sessionId, expectedStatus, transition } = params;
  const db = getDb();

  const updated = await db
    .update(sessions)
    .set({ status: transition.next, parked: transition.parked, updatedAt: new Date() })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.athleteId, athleteId),
        eq(sessions.status, expectedStatus),
      ),
    )
    .returning({ id: sessions.id });

  if (updated.length === 0) return { ok: false, reason: 'conflict' };

  await db.insert(events).values({
    athleteId,
    actorType: 'athlete',
    actorId: athleteId,
    type: transition.event,
    payload: { sessionId },
  });

  return { ok: true };
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
  if (isFutureDated(found.row.date, today)) return { ok: false, reason: 'future' };

  return applyTransition({
    athleteId,
    sessionId,
    expectedStatus: found.row.status,
    transition: completeTransition(),
  });
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

  return applyTransition({
    athleteId,
    sessionId,
    expectedStatus: found.row.status,
    transition: skipTransition(found.row.status),
  });
}

/**
 * Toggles Unavailable ↔ Planned under server authority — the Session Drawer's
 * direct route to the session-level Unavailable state (distinct from an
 * Unavailable *Date*, which availability-actions.ts covers). Refuses a frozen
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

  return applyTransition({
    athleteId,
    sessionId,
    expectedStatus: found.row.status,
    transition: unavailableTransition(found.row.status),
  });
}
