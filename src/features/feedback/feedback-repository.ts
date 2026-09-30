import { getDb } from '@/db';
import { athleteFeedback } from '@/db/schema';

/**
 * The only place the app writes `athlete_feedback`.
 *
 * Every function takes the owning `athleteId` resolved from the authenticated
 * server session, never a client-supplied value (ADR 0006).
 *
 * Nothing here reads, across athletes or at all, and nothing here is exposed to
 * a Head Coach: there is deliberately no by-coach query to call. The builders'
 * readout of what testers said is `feedback-report-repository.ts`, run from a
 * terminal (`npm run feedback`) and called by nothing in the app.
 */

export interface FeedbackSubmission {
  athleteId: string;
  body: string;
  /** The View the tester was on when they reached the escape hatch. */
  view: string | null;
}

/**
 * Stores one submission from the feedback page's comment field.
 *
 * No model call, no consent gate, no conversation, by design: the escape hatch
 * never depends on the API, because a tester whose Coach is broken is the tester
 * with the most to say.
 *
 * The row kind is `fallback`, the name from when this box sat beside the
 * Feedback Interview. It is now the only way to give feedback (ADR 0009, amended
 * 2026-09-30), and the kind is kept so the readout and the feedback-review
 * ledger read old and new rows alike, with no migration. There is no interview
 * to fail, so `coachFailureReason` is always null on a new row.
 */
export async function recordFeedback(submission: FeedbackSubmission): Promise<void> {
  await getDb().insert(athleteFeedback).values({
    athleteId: submission.athleteId,
    kind: 'fallback',
    body: submission.body,
    view: submission.view,
    conversationId: null,
    coachFailureReason: null,
  });
}
