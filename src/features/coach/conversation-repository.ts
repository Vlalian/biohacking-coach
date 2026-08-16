import { and, asc, count, desc, eq, gte, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { conversations, messages } from '@/db/schema';
import {
  coachOwnedOrNull,
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
 * Whether the athlete has already held a Weekly Session in the week containing
 * `weekStart` (a 'YYYY-MM-DD' Monday).
 *
 * This is the Weekly Session offer's "already done" test. It asks about the
 * *conversation*, not about whether a plan exists: an auto-drafted week must
 * still be offered for discussion, so a plan existing is not the same as the
 * athlete having held the session (coach-overlay issue 04, decision 4).
 */
export async function hasHeldWeeklySessionInWeek(
  athleteId: string,
  weekStart: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.athleteId, athleteId),
        eq(conversations.kind, 'weekly_session'),
        gte(conversations.createdAt, new Date(`${weekStart}T00:00:00`)),
      ),
    );
  return (row?.n ?? 0) > 0;
}

/**
 * Every still-open conversation this athlete has, newest first.
 *
 * The Coach Overlay hosts one conversation surface across kinds (ADR 0007), so
 * the shell resolves what is open *generically* rather than naming one kind: the
 * resting `coach_chat` and an in-progress `weekly_session` are both open at once
 * by design, and a kind added later needs no extra query at the call site.
 */
export async function getOpenConversations(athleteId: string): Promise<Conversation[]> {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(and(eq(conversations.athleteId, athleteId), isNull(conversations.endedAt)))
    .orderBy(desc(conversations.createdAt));
  return rows.map(toConversation);
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
  return appendInOrder(conversationId, entries);
}

/**
 * Appends already-authorised messages to a conversation, assigning each the next
 * `seq` in turn. The ownership gate is the caller's — {@link appendMessages}
 * checks athlete ownership, {@link appendBriefingMessages} checks coach ownership
 * — so this shared core never crosses an owner; it only serialises the write.
 *
 * Read-max-then-insert is not atomic: two concurrent appends to the same
 * conversation can pick the same next seq. The unique (conversation_id, seq)
 * index makes that a failed write rather than a corrupted transcript, so the
 * loser simply re-reads and retries. Bounded, because a persistent failure is a
 * real error and must surface rather than spin.
 */
async function appendInOrder(
  conversationId: string,
  entries: { role: MessageRole; content: string }[],
): Promise<Message[]> {
  if (entries.length === 0) return [];

  for (let attempt = 0; ; attempt++) {
    const [last] = await getDb()
      .select({ seq: messages.seq })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.seq))
      .limit(1);

    const startSeq = nextSeq(last ? [last] : []);
    try {
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
    } catch (error) {
      if (attempt >= SEQ_RETRIES || !isSeqConflict(error)) throw error;
    }
  }
}

const SEQ_RETRIES = 3;

// ── Coach Briefing (slice 13) ─────────────────────────────────────────────────
//
// A Coach Briefing is the one conversation kind owned by a *coach*, not an
// athlete: `coach_id` is the owner, `athlete_id` names the subject. Every read
// and write below is scoped to the coach resolved from the authenticated session
// upstream and to `kind = 'coach_briefing'`, so an athlete-owned conversation id
// — or another coach's briefing — never resolves here (ADR 0006). The active
// Coaching Link is a second gate the service re-checks on every turn (severing
// revokes); this repository owns only the coach-ownership half.

/** Opens a briefing a coach owns about one athlete. */
export async function createBriefing(input: {
  coachId: string;
  athleteId: string;
}): Promise<Conversation> {
  const [row] = await getDb()
    .insert(conversations)
    .values({
      athleteId: input.athleteId,
      coachId: input.coachId,
      kind: 'coach_briefing',
    })
    .returning();
  return toConversation(row);
}

/**
 * The briefing for this id — but only if it is a `coach_briefing` owned by this
 * coach. The coach-ownership filter is part of the query, so another coach's id,
 * or an athlete-owned conversation, can never resolve to a row;
 * {@link coachOwnedOrNull} is the belt-and-suspenders in-code check.
 */
export async function getOwnedBriefing(
  coachId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.coachId, coachId),
        eq(conversations.kind, 'coach_briefing'),
      ),
    )
    .limit(1);
  return coachOwnedOrNull(rows[0] ? toConversation(rows[0]) : undefined, coachId);
}

/**
 * The coach's most recent briefing about this athlete, with its transcript, or
 * null when none exists. The page uses it to restore a briefing on refresh — the
 * whole transcript is server-side, so nothing lives only in the browser (ADR
 * 0006). Scoped to the coach *and* the athlete, so it never surfaces a briefing
 * about a different athlete.
 */
export async function getLatestBriefingWithMessages(
  coachId: string,
  athleteId: string,
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.coachId, coachId),
        eq(conversations.athleteId, athleteId),
        eq(conversations.kind, 'coach_briefing'),
      ),
    )
    .orderBy(desc(conversations.createdAt))
    .limit(1);
  if (!rows[0]) return null;
  const conversation = toConversation(rows[0]);
  return { conversation, messages: await getMessages(conversation.id) };
}

/**
 * Appends messages to a briefing this coach owns, assigning each the next `seq`.
 * Coach ownership is verified first: a briefing that is not this coach's is
 * refused (returns null) and nothing is written.
 */
export async function appendBriefingMessages(
  coachId: string,
  conversationId: string,
  entries: { role: MessageRole; content: string }[],
): Promise<Message[] | null> {
  const owned = await getOwnedBriefing(coachId, conversationId);
  if (!owned) return null;
  return appendInOrder(conversationId, entries);
}

/** True for a unique violation on the (conversation_id, seq) index. */
function isSeqConflict(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === '23505') return true;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('messages_conversation_seq_idx') ||
    message.includes('duplicate key value')
  );
}
