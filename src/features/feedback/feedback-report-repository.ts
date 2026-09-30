import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { athleteFeedback, conversations, messages } from '@/db/schema';
import type { MessageRole } from '@/features/coach/conversation';
import type { FeedbackReportInput, ReportInterview } from './feedback-report';

/**
 * The reads behind the feedback readout (`scripts/feedback.ts`).
 *
 * Read-only by construction — nothing here writes. Like `metrics-repository`
 * and unlike every athlete-facing repository, this is deliberately **not**
 * scoped to one signed-in athlete: it runs from a terminal, by the person
 * running the test, over every tester at once. That is exactly why it selects
 * opaque ids and never joins `user`: the readout must not be able to name
 * anybody (ADR 0006).
 *
 * It is not a Head Coach surface and must never become one. `feedback-repository`
 * keeps its promise that the app exposes no by-coach query; the only caller of
 * this module is the script.
 */

/** Every Feedback Interview and every `athlete_feedback` row, in three reads. */
export async function getFeedbackReportInput(): Promise<FeedbackReportInput> {
  const db = getDb();

  const [conversationRows, messageRows, feedbackRows] = await Promise.all([
    db
      .select({
        id: conversations.id,
        athleteId: conversations.athleteId,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.kind, 'feedback'))
      .orderBy(asc(conversations.createdAt)),

    // Only the `feedback` kind's turns. The join is the filter: a Coach Chat
    // turn must never appear in a feedback readout any more than a feedback turn
    // may reach a Coach prompt (ADR 0009).
    db
      .select({
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.kind, 'feedback'))
      .orderBy(asc(messages.seq)),

    db
      .select({
        athleteId: athleteFeedback.athleteId,
        kind: athleteFeedback.kind,
        body: athleteFeedback.body,
        view: athleteFeedback.view,
        conversationId: athleteFeedback.conversationId,
        coachFailureReason: athleteFeedback.coachFailureReason,
        createdAt: athleteFeedback.createdAt,
      })
      .from(athleteFeedback)
      .orderBy(asc(athleteFeedback.createdAt)),
  ]);

  const interviews: ReportInterview[] = conversationRows.map((c) => ({
    athleteId: c.athleteId,
    conversationId: c.id,
    startedAt: c.createdAt,
    turns: messageRows
      .filter((m) => m.conversationId === c.id)
      .map((m) => ({ role: m.role as MessageRole, content: m.content, createdAt: m.createdAt })),
  }));

  return { interviews, feedback: feedbackRows };
}
