import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { events, sessions } from '@/db/schema';
import { describeConflict, type AttemptedChange, type SessionConflict } from './conflict';
import { toSession } from './session';

/**
 * The one way a contested session column is written.
 *
 * Both the athlete and their Head Coach write the same session rows. Every such
 * write used to read the row, check it, then write unconditionally — so two
 * writes racing meant the second silently overwrote the first, which is exactly
 * the "no silent overwrites" guarantee the system design asks for.
 *
 * The fix is the same move the rest of this codebase already makes for
 * ownership: **the guard travels with the write.** `athlete-session.ts` puts the
 * ownership check in the WHERE rather than trusting the read before it, and
 * `athlete-session.ts`'s `dayOrder` is computed inside the INSERT for the same
 * reason. This module extends that to the version: the caller passes the version
 * it read, the version goes into the WHERE, and a row that has moved on since
 * simply does not match. No lock, no queue, no second round of coordination.
 *
 * A refused write is reported synchronously, in the request the writer is
 * already waiting on. That is the cheap half of what a queue-based design buys
 * with a rejection handler, a broker, and a subscriber.
 *
 * **Atomicity, stated honestly.** The `neon-http` driver has no interactive
 * transactions, and `db.batch()` runs every statement unconditionally — which
 * would log an event for a write that lost. So the compare-and-set runs first
 * and the event is written only if it won: two statements, not one. If the
 * second fails, a real change goes unlogged. That is a worse audit trail, never
 * a wrong session row, and it is the trade this driver forces. Moving both into
 * one data-modifying CTE would close it, at the cost of hand-written SQL in
 * every call site; revisit if the event log ever becomes load-bearing.
 */

/** The columns a versioned write may set. Closed on purpose. */
export type SessionContentColumns = {
  date?: string;
  type?: string;
  duration?: number | null;
  zone?: string | null;
  title?: string | null;
  note?: string | null;
  isTraining?: boolean;
};

/**
 * The event to record, once the write is known to have won. Optional because
 * not every write logs one today — an Athlete Session edit never has — and this
 * seam is not the place to start emitting event types nothing reads yet.
 */
export type WriteEvent = {
  actorType: 'athlete' | 'head_coach';
  actorId: string;
  type: string;
  payload: Record<string, unknown>;
};

export type VersionedWriteResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict'; conflict: SessionConflict };

/**
 * Re-reads the row a refused write was aiming at, so the caller can be told what
 * beat them rather than just that something did. Scoped to the athlete, like
 * every other read of a session (ADR 0006).
 */
async function readCurrent(athleteId: string, sessionId: string) {
  const [row] = await getDb()
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.athleteId, athleteId)))
    .limit(1);

  return row ? toSession(row) : null;
}

/**
 * Applies a content or placement change, but only to the version the caller
 * read. Bumps the version so the next stale writer is caught in turn.
 */
export async function casUpdateSession(params: {
  athleteId: string;
  sessionId: string;
  expectedVersion: number;
  set: SessionContentColumns;
  attempted: AttemptedChange;
  event?: WriteEvent;
}): Promise<VersionedWriteResult> {
  const { athleteId, sessionId, expectedVersion, set, attempted, event } = params;
  const db = getDb();

  const updated = await db
    .update(sessions)
    .set({ ...set, version: expectedVersion + 1, updatedAt: new Date() })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.athleteId, athleteId),
        eq(sessions.version, expectedVersion),
      ),
    )
    .returning({ version: sessions.version });

  if (updated.length === 0) {
    return {
      ok: false,
      reason: 'conflict',
      conflict: describeConflict({
        sessionId,
        baseVersion: expectedVersion,
        current: await readCurrent(athleteId, sessionId),
        attempted,
      }),
    };
  }

  if (event) await db.insert(events).values({ athleteId, ...event });

  return { ok: true, version: updated[0].version };
}

/**
 * Deletes a session, but only at the version the caller read — so a delete
 * cannot quietly discard an edit that landed while the deleter was deciding.
 */
export async function casDeleteSession(params: {
  athleteId: string;
  sessionId: string;
  expectedVersion: number;
  event?: WriteEvent;
}): Promise<VersionedWriteResult> {
  const { athleteId, sessionId, expectedVersion, event } = params;
  const db = getDb();

  const deleted = await db
    .delete(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.athleteId, athleteId),
        eq(sessions.version, expectedVersion),
      ),
    )
    .returning({ id: sessions.id });

  if (deleted.length === 0) {
    return {
      ok: false,
      reason: 'conflict',
      conflict: describeConflict({
        sessionId,
        baseVersion: expectedVersion,
        current: await readCurrent(athleteId, sessionId),
        attempted: {},
      }),
    };
  }

  if (event) await db.insert(events).values({ athleteId, ...event });

  return { ok: true, version: expectedVersion };
}
