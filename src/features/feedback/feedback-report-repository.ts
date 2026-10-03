import { asc, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { athleteFeedback, conversations, messageFeedback, messages, sessions, type MessageRating } from '@/db/schema';
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

/**
 * Every Feedback Interview, every `athlete_feedback` row, every thumbs rating
 * and every Session Reflection that carries a comment, in five reads
 * (showable-version/48).
 */
export async function getFeedbackReportInput(): Promise<FeedbackReportInput> {
  const db = getDb();

  const [conversationRows, messageRows, feedbackRows, thumbRows, reflectionRows] = await Promise.all([
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
        seq: messages.seq,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.kind, 'feedback'))
      .orderBy(asc(messages.seq)),

    db
      .select({
        id: athleteFeedback.id,
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

    // Thumbs sit only on Momentum's messages; the join brings the message text
    // the rating is about. Every row is feedback, so there is nothing to filter.
    db
      .select({
        athleteId: messageFeedback.athleteId,
        messageId: messageFeedback.messageId,
        rating: messageFeedback.rating,
        comment: messageFeedback.comment,
        messageText: messages.content,
        updatedAt: messageFeedback.updatedAt,
      })
      .from(messageFeedback)
      .innerJoin(messages, eq(messageFeedback.messageId, messages.id))
      .orderBy(asc(messageFeedback.updatedAt)),

    // A reflection is feedback only when the athlete wrote something.
    db
      .select({
        athleteId: sessions.athleteId,
        sessionId: sessions.id,
        date: sessions.date,
        type: sessions.type,
        body: sessions.feedbackBody,
        mind: sessions.feedbackMind,
        comment: sessions.feedbackComment,
        ratedAt: sessions.ratedAt,
        updatedAt: sessions.updatedAt,
      })
      .from(sessions)
      .where(isNotNull(sessions.feedbackComment))
      .orderBy(asc(sessions.date)),
  ]);

  const interviews: ReportInterview[] = conversationRows.map((c) => ({
    athleteId: c.athleteId,
    conversationId: c.id,
    startedAt: c.createdAt,
    turns: messageRows
      .filter((m) => m.conversationId === c.id)
      .map((m) => ({ role: m.role as MessageRole, content: m.content, createdAt: m.createdAt, seq: m.seq })),
  }));

  return {
    interviews,
    feedback: feedbackRows,
    // The column's check constraint holds `rating` to up/down.
    thumbs: thumbRows.map((t) => ({ ...t, rating: t.rating as MessageRating })),
    // A comment always comes with `ratedAt` from the app; a seeded one may not,
    // and it is shown dated by its row's last change rather than dropped.
    reflections: reflectionRows.map(({ updatedAt, ratedAt, comment, ...r }) => ({
      ...r,
      comment: comment as string,
      ratedAt: ratedAt ?? updatedAt,
    })),
  };
}
