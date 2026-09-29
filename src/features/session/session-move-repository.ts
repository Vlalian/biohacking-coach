import { and, asc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/db';
import { events } from '@/db/schema';

/**
 * A Session Move as the Coach reads it (`training-architecture/52`): the day a
 * session left, the day it went to, and whose hand moved it. Read back from the
 * `session_moved` events every move already writes (`session-move.ts`), so
 * nothing new is recorded to know it.
 */
export interface SessionMoveFact {
  from: string;
  to: string;
  by: string;
}

/** A stored payload's two days, or null when it does not carry both as strings. */
function movedDays(payload: unknown): { from: string; to: string } | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  return typeof p.from === 'string' && typeof p.to === 'string' ? { from: p.from, to: p.to } : null;
}

/**
 * This athlete's Session Moves recorded on or after `sinceKey` (a
 * 'YYYY-MM-DD'), oldest first. Scoped to the athlete id in the WHERE (ADR
 * 0006). An event whose payload does not say where from and where to is left
 * out rather than guessed at.
 */
export async function getSessionMovesSince(athleteId: string, sinceKey: string): Promise<SessionMoveFact[]> {
  const rows = await getDb()
    .select({ actorType: events.actorType, payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        eq(events.type, 'session_moved'),
        gte(events.createdAt, new Date(`${sinceKey}T00:00:00`)),
      ),
    )
    .orderBy(asc(events.createdAt));
  return rows.flatMap((row) => {
    const days = movedDays(row.payload);
    return days ? [{ ...days, by: row.actorType }] : [];
  });
}
