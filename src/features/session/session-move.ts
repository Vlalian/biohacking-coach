import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, events } from '@/db/schema';
import { classifyMove } from './move-rules';

/**
 * The result of an attempted move. On failure, `reason` says why, so the caller
 * can stay silent (the client already knows) without guessing.
 */
export type MoveResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not-authenticated' | 'not-found' | 'not-owner' | 'frozen' | 'bounce';
    };

/**
 * Applies a Session Move under server authority (ADR 0006).
 *
 * The `athleteId` is the caller's own, derived upstream from the authenticated
 * session — never from the request body. This function then proves the athlete
 * owns the target session, re-runs the Move rules against the *server's* today,
 * and only on a clean `move` writes anything. A request that is illegal, or
 * against someone else's session, changes nothing, whatever the client sent.
 *
 * The session update and the `session_moved` event land in one transaction:
 * both or neither. Narration is benched (ticket 02, amended) — the event is
 * recorded with its actor and `narrated_at` stays null; nothing is announced.
 */
export async function moveSession(params: {
  athleteId: string;
  sessionId: string;
  targetDate: string;
  today: string;
}): Promise<MoveResult> {
  const { athleteId, sessionId, targetDate, today } = params;
  const db = getDb();

  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return { ok: false, reason: 'not-found' };
  if (row.athleteId !== athleteId) return { ok: false, reason: 'not-owner' };

  const verdict = classifyMove({ date: row.date, status: row.status }, targetDate, today);
  if (verdict !== 'move') return { ok: false, reason: verdict };

  await db.batch([
    db
      .update(sessions)
      .set({ date: targetDate, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId)),
    db.insert(events).values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: 'session_moved',
      payload: { sessionId, from: row.date, to: targetDate },
    }),
  ]);

  return { ok: true };
}
