import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions } from '@/db/schema';

export type RateResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'not-found' | 'not-owner' | 'not-completed' };

/** RPE 1–5, whole numbers — the Session Reflection scale (the DB check mirrors this). */
function isValidScore(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

/**
 * Records a Session Reflection under server authority (ADR 0006).
 *
 * The `athleteId` is the caller's own, resolved upstream from the authenticated
 * session — never the request. Ownership is proven before any write, so a forged
 * request for another athlete's session changes nothing. Scores are validated to
 * RPE 1–5 here for a clean refusal rather than a raw database error.
 *
 * Writing sets `rated_at`, so a re-rate updates the timestamp too. The comment is
 * athlete free-text stored plainly; the disclosure that it now lives server-side
 * belongs to the consent artifact (GDPR ticket), not an encryption policy here.
 */
export async function rateSession(params: {
  athleteId: string;
  sessionId: string;
  body: number;
  mind: number;
  comment: string | null;
}): Promise<RateResult> {
  const { athleteId, sessionId, body, mind, comment } = params;

  if (!isValidScore(body) || !isValidScore(mind)) return { ok: false, reason: 'invalid' };

  const db = getDb();
  const [row] = await db
    .select({ athleteId: sessions.athleteId, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return { ok: false, reason: 'not-found' };
  if (row.athleteId !== athleteId) return { ok: false, reason: 'not-owner' };
  // A Reflection is post-session — only a completed session is rateable, on the
  // server, not just in the UI. A forged rating of a planned session is refused.
  if (row.status !== 'completed') return { ok: false, reason: 'not-completed' };

  // comment is typed string|null, but a forged request could send anything;
  // guard the runtime type before trimming so it can never throw.
  const trimmed = typeof comment === 'string' ? comment.trim() : undefined;
  await db
    .update(sessions)
    .set({
      feedbackBody: body,
      feedbackMind: mind,
      feedbackComment: trimmed ? trimmed : null,
      ratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  return { ok: true };
}
