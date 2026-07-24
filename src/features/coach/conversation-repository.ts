import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { conversations, messages } from '@/db/schema';
import {
  nextSeq,
  ownedOrNull,
  toConversation,
  toMessage,
  type Conversation,
  type ConversationKind,
  type Message,
  type MessageRole,
} from './conversation';

/**
 * The only place the app reads and writes Coach conversations in Postgres.
 *
 * Every function takes the owning `athleteId` — the one resolved from the
 * authenticated server session, never a client-supplied value — and scopes its
 * query to it. A conversation reached by a client-supplied id is matched against
 * that owner in the query itself (`athlete_id = :athleteId`), so asking for
 * another athlete's conversation returns nothing and the caller refuses it (ADR
 * 0006). No shape of these calls crosses athletes.
 */

export async function createConversation(input: {
  athleteId: string;
  kind: ConversationKind;
  weeklySessionNumber?: number | null;
}): Promise<Conversation> {
  const [row] = await getDb()
    .insert(conversations)
    .values({
      athleteId: input.athleteId,
      kind: input.kind,
      weeklySessionNumber: input.weeklySessionNumber ?? null,
    })
    .returning();
  return toConversation(row);
}

/**
 * How many Weekly Sessions this athlete has had. The next one is this + 1, which
 * selects the conversational arc (Session 1 welcomes, Session 4+ reviews).
 */
export async function countWeeklySessions(athleteId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.athleteId, athleteId),
        eq(conversations.kind, 'weekly_session'),
      ),
    );
  return row?.n ?? 0;
}

/**
 * The athlete's most recent still-open conversation of a kind, or null.
 *
 * The Weekly Session page uses this to restore an in-progress session on refresh:
 * an open (`ended_at IS NULL`) conversation is one the athlete has not finalised,
 * so its transcript is picked back up rather than lost.
 */
export async function getLatestOpenConversation(
  athleteId: string,
  kind: ConversationKind,
): Promise<Conversation | null> {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.athleteId, athleteId),
        eq(conversations.kind, kind),
        isNull(conversations.endedAt),
      ),
    )
    .orderBy(desc(conversations.createdAt))
    .limit(1);
  return rows[0] ? toConversation(rows[0]) : null;
}

/** Marks an owned conversation ended. Returns false when the id is not owned. */
export async function endConversation(
  athleteId: string,
  conversationId: string,
  endedAt: Date,
): Promise<boolean> {
  const owned = await getOwnedConversation(athleteId, conversationId);
  if (!owned) return false;
  await getDb()
    .update(conversations)
    .set({ endedAt })
    .where(eq(conversations.id, conversationId));
  return true;
}

/**
 * The conversation for this id — but only if it belongs to this athlete. The
 * ownership filter is part of the query, so another athlete's id can never
 * resolve to a row; {@link ownedOrNull} is the belt-and-suspenders in-code check.
 */
export async function getOwnedConversation(
  athleteId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.athleteId, athleteId),
      ),
    )
    .limit(1);
  return ownedOrNull(rows[0] ? toConversation(rows[0]) : undefined, athleteId);
}

/** A conversation's messages in stable `seq` order. */
export async function getMessages(conversationId: string): Promise<Message[]> {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.seq));
  return rows.map(toMessage);
}

/**
 * The owned conversation together with its transcript, or null when the id is
 * not this athlete's. The single call every read path uses so ownership is
 * checked before any message is returned.
 */
export async function getOwnedConversationWithMessages(
  athleteId: string,
  conversationId: string,
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  const conversation = await getOwnedConversation(athleteId, conversationId);
  if (!conversation) return null;
  return { conversation, messages: await getMessages(conversationId) };
}

/**
 * Appends messages to an owned conversation, assigning each the next `seq` in
 * turn. Ownership is verified first: an id that is not this athlete's is refused
 * (returns null) and nothing is written. Returns the appended messages in order.
 */
export async function appendMessages(
  athleteId: string,
  conversationId: string,
  entries: { role: MessageRole; content: string }[],
): Promise<Message[] | null> {
  const owned = await getOwnedConversation(athleteId, conversationId);
  if (!owned) return null;
  if (entries.length === 0) return [];

  const [last] = await getDb()
    .select({ seq: messages.seq })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.seq))
    .limit(1);

  const startSeq = nextSeq(last ? [last] : []);
  const rows = await getDb()
    .insert(messages)
    .values(
      entries.map((e, i) => ({
        conversationId,
        role: e.role,
        content: e.content,
        seq: startSeq + i,
      })),
    )
    .returning();
  return rows.map(toMessage);
}
