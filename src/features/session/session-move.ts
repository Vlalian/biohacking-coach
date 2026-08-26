import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions } from '@/db/schema';
import { classifyMove } from './move-rules';
import { casUpdateSession } from './versioned-write';
import type { SessionConflict } from './conflict';

/**
 * The result of an attempted move. On failure, `reason` says why, so the caller
 * can stay silent (the client already knows) without guessing.
 *
 * `'conflict'` is the exception that does carry a payload: the client cannot
 * know that someone else moved or edited the session underneath it, so the
 * refusal has to say what won (`versioned-write.ts`).
 */
export type MoveResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not-authenticated' | 'not-found' | 'not-owner' | 'frozen' | 'bounce';
    }
  | { ok: false; reason: 'conflict'; conflict: SessionConflict };

/**
 * Applies a Session Move under server authority (ADR 0006).
 *
 * The `athleteId` is the caller's own, derived upstream from the authenticated
 * session — never from the request body. This function then proves the athlete
 * owns the target session, re-runs the Move rules against the *server's* today,
 * and only on a clean `move` writes anything. A request that is illegal, or
 * against someone else's session, changes nothing, whatever the client sent.
 *
 * The move carries the version the client read. A Head Coach editing the same
 * session sets its `date` too, so placement is contested: without the version
 * the later of the two writes would silently win. Narration is benched (ticket
 * 02, amended) — the event is recorded with its actor and `narrated_at` stays
 * null; nothing is announced.
 */
export async function moveSession(params: {
  athleteId: string;
  sessionId: string;
  targetDate: string;
  today: string;
  expectedVersion: number;
}): Promise<MoveResult> {
  const { athleteId, sessionId, targetDate, today, expectedVersion } = params;

  const [row] = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return { ok: false, reason: 'not-found' };
  if (row.athleteId !== athleteId) return { ok: false, reason: 'not-owner' };

  const verdict = classifyMove({ date: row.date, status: row.status }, targetDate, today);
  if (verdict !== 'move') return { ok: false, reason: verdict };

  const written = await casUpdateSession({
    athleteId,
    sessionId,
    expectedVersion,
    set: { date: targetDate },
    attempted: { date: targetDate },
    event: {
      actorType: 'athlete',
      actorId: athleteId,
      type: 'session_moved',
      payload: { sessionId, from: row.date, to: targetDate },
    },
  });

  return written.ok ? { ok: true } : written;
}
