import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { conversations, messageFeedback, messages, type MessageRating } from '@/db/schema';

/**
 * The only place the app reads and writes `message_feedback` — the thumbs a
 * tester leaves on a Coach message (`showable-version/05`, item 3).
 *
 * Every function takes the owning `athleteId` resolved from the authenticated
 * server session, never a client-supplied value, and scopes its query to it
 * (ADR 0006). Nothing here reads across athletes.
 *
 * **Nothing here is exposed to a Head Coach: there is deliberately no by-coach
 * query to call.** The ticket's rule is that a flag is never surfaced to a Head
 * Coach and never presented to the athlete as a score, and the way to keep a
 * rule like that is to leave out the function rather than to remember a filter.
 * Nothing aggregates either — no count, no average, no rate. The flags are read
 * by opening the database, which is the whole point of pinning them to a
 * message id.
 */

export interface MessageRatingInput {
  athleteId: string;
  messageId: string;
  rating: MessageRating;
  /** The tester's optional one line. Athlete free text: it reaches nothing automatically. */
  comment: string | null;
}

/** A stored flag, as a surface renders it back. */
export interface StoredRating {
  rating: MessageRating;
  comment: string | null;
}

/**
 * Records the tester's flag on one message, replacing any flag already there.
 *
 * One flag per message and changeable: the unique index on `message_id` makes
 * that true in the schema, and the upsert is how a change lands on it. A second
 * thumbs is the tester changing their mind, not a second opinion, so `createdAt`
 * is left alone — the moment they first reacted is the interesting one.
 *
 * The update half carries the athlete predicate as well as the message id. The
 * unique index is on `message_id` alone, so without it a conflict on a row
 * belonging to someone else would be *updated* with this athlete's rating and
 * comment rather than refused. `flaggableCoachMessage` makes that unreachable
 * today, which is exactly why the predicate is here: a guard left behind in the
 * read guards nothing (ADR 0010), and the module header above claims this
 * scoping for every function in it.
 */
export async function rateMessage(input: MessageRatingInput): Promise<void> {
  await getDb()
    .insert(messageFeedback)
    .values({
      athleteId: input.athleteId,
      messageId: input.messageId,
      rating: input.rating,
      comment: input.comment,
    })
    .onConflictDoUpdate({
      target: messageFeedback.messageId,
      set: {
        rating: input.rating,
        comment: input.comment,
        updatedAt: new Date(),
      },
      where: eq(messageFeedback.athleteId, input.athleteId),
    });
}

/**
 * Removes the flag entirely — the tester changed their mind about flagging at
 * all, which is different from changing which way it points.
 *
 * Scoped to the athlete as well as the message: the message id arrives from a
 * client, and on its own it would name any message in the database.
 */
export async function clearMessageRating(params: {
  athleteId: string;
  messageId: string;
}): Promise<void> {
  await getDb()
    .delete(messageFeedback)
    .where(
      and(
        eq(messageFeedback.athleteId, params.athleteId),
        eq(messageFeedback.messageId, params.messageId),
      ),
    );
}

/**
 * This athlete's flags on one conversation, keyed by message id.
 *
 * A map rather than a list because that is how a transcript renders: each row
 * asks "was this one flagged?" once, and a stored flag has to come back so it
 * re-renders on reload rather than looking un-flagged the moment the page moves.
 */
export async function getRatingsForConversation(
  athleteId: string,
  conversationId: string,
): Promise<Record<string, StoredRating>> {
  const rows = await getDb()
    .select({
      messageId: messageFeedback.messageId,
      rating: messageFeedback.rating,
      comment: messageFeedback.comment,
    })
    .from(messageFeedback)
    .where(
      and(
        eq(messageFeedback.athleteId, athleteId),
        inArray(
          messageFeedback.messageId,
          getDb()
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.conversationId, conversationId)),
        ),
      ),
    );

  return Object.fromEntries(
    rows.map((r) => [
      r.messageId,
      { rating: r.rating as MessageRating, comment: r.comment },
    ]),
  );
}

/**
 * Whether this athlete may flag this message at all.
 *
 * One query answers both halves of the question, which is why it is one query:
 * the message id arrives from a client, so it has to be checked against the
 * conversations this athlete owns, and only the Coach's own turns are flaggable
 * - the thumbs exist to say something about what the Coach said, and an athlete
 * rating their own message says nothing anyone can act on.
 */
export async function flaggableCoachMessage(
  athleteId: string,
  messageId: string,
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.role, 'coach_ai'),
        inArray(
          messages.conversationId,
          getDb()
            .select({ id: conversations.id })
            .from(conversations)
            .where(eq(conversations.athleteId, athleteId)),
        ),
      ),
    );

  return rows.length > 0;
}
