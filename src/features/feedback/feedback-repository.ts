import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { athleteFeedback } from '@/db/schema';

/**
 * The only place the app reads and writes `athlete_feedback`.
 *
 * Two kinds of row, and neither is a conversation turn — the interview
 * transcript lives in `conversations`/`messages` like every other conversation
 * (`showable-version/07`). Every function takes the owning `athleteId` resolved
 * from the authenticated server session, never a client-supplied value, and
 * scopes its query to it (ADR 0006).
 *
 * Nothing here reads across athletes, and nothing here is exposed to a Head
 * Coach: there is deliberately no by-coach query to call.
 */

export interface FallbackSubmission {
  athleteId: string;
  body: string;
  /** The View the tester was on when they reached the escape hatch. */
  view: string | null;
  /**
   * Why the Coach could not answer, when that is what sent them to the box.
   * Null when they simply chose to type instead of talk.
   */
  coachFailureReason: string | null;
}

/**
 * Stores one submission from the plain textarea beside the interview.
 *
 * No model call, no consent gate, no conversation — by design. The escape hatch
 * can never hard-depend on the API, because a tester whose Coach is broken is
 * the tester with the most to say.
 */
export async function recordFallback(submission: FallbackSubmission): Promise<void> {
  await getDb().insert(athleteFeedback).values({
    athleteId: submission.athleteId,
    kind: 'fallback',
    body: submission.body,
    view: submission.view,
    conversationId: null,
    coachFailureReason: submission.coachFailureReason,
  });
}

/**
 * Stores the Trust Signal answer against the interview it was asked in.
 *
 * The conversation id is what makes the answer readable afterwards: the reason
 * is the valuable half, and the reason is in the turns around it.
 */
export async function recordTrustSignal(answer: {
  athleteId: string;
  conversationId: string;
  body: string;
}): Promise<void> {
  await getDb().insert(athleteFeedback).values({
    athleteId: answer.athleteId,
    kind: 'trust_signal',
    body: answer.body,
    view: null,
    conversationId: answer.conversationId,
    coachFailureReason: null,
  });
}

/** Whether this athlete has already answered the Trust Signal. Asked once. */
export async function hasTrustSignal(athleteId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: athleteFeedback.id })
    .from(athleteFeedback)
    .where(
      and(
        eq(athleteFeedback.athleteId, athleteId),
        eq(athleteFeedback.kind, 'trust_signal'),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
