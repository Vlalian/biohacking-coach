import type { ConversationRow, MessageRow } from '@/db/schema';
import type { CoachMessage } from './coach-client';
import type { ConversationKind } from '@/lib/conversation-kinds';

/**
 * The kinds of Coach conversation, defined once in
 * {@link import('@/lib/conversation-kinds').CONVERSATION_KINDS} and re-exported
 * here, where the rest of the Coach feature already looks for it. That constant
 * is also what builds the database CHECK constraint, so the union and the
 * constraint are literally the same list — they used to be two, edited by hand
 * together.
 *
 * Was six. `negotiation` and `reflection` were removed 2026-08-18: neither was
 * ever written by any code path. Session Negotiation is not a conversation kind
 * — it is a *behavior* inside Coach Chat, carrying the Session as a Reference
 * (CONTEXT.md, decided 2026-08-12); giving it a kind of its own would recreate
 * one of the six talk-to-the-Coach surfaces ADR-0007 retired. A Session
 * Reflection is two RPE ratings and an optional comment stored against the
 * session — not a transcript, so not a conversation.
 *
 * `onboarding` stays: it is live, written by `onboarding-service`.
 *
 * `feedback` joined 2026-09-01 (`showable-version/07`) and is the one kind that
 * is **not** a Coach conversation at all: the Feedback Interview is conducted by
 * an interviewer that is explicitly not the Coach, and its transcript must never
 * reach a Coach prompt. That is exactly why it has its own kind rather than
 * living inside `coach_chat`, whose whole transcript is resent to the Coach on
 * every later turn.
 */
export type { ConversationKind };

export type MessageRole = 'athlete' | 'coach_ai' | 'head_coach';

/**
 * A conversation as the app knows one — the stored row minus nothing it needs,
 * with `kind`/`role` narrowed to their closed sets at this boundary.
 */
export interface Conversation {
  id: string;
  athleteId: string;
  kind: ConversationKind;
  /** The owning coach for a `coach_briefing`; null for athlete-owned kinds. */
  coachId: string | null;
  weeklySessionNumber: number | null;
  createdAt: Date;
  endedAt: Date | null;
}

/**
 * The two open conversations the app shell restores, chosen from whatever this
 * athlete has open. Both can be open at once by design: the resting Coach Chat,
 * and an in-progress Weekly Session on top of it.
 *
 * Selected **by name**, deliberately, and this is the one place that decision is
 * made. A `feedback` interview is also an open conversation belonging to the
 * same athlete, and it must never be restored into the Coach Overlay: Coach Chat
 * resends its entire transcript to the model on every later turn, so a complaint
 * picked up as a chat becomes something the athlete said about their training,
 * for the rest of the test (`showable-version/07`). A kind is opted *in* here;
 * it is never inherited by being open.
 */
export interface OpenConversations {
  weeklySession: Conversation | null;
  coachChat: Conversation | null;
}

export function selectOpenConversations(open: Conversation[]): OpenConversations {
  return {
    weeklySession: open.find((c) => c.kind === 'weekly_session') ?? null,
    coachChat: open.find((c) => c.kind === 'coach_chat') ?? null,
  };
}

/** One message in a transcript, in `seq` order. */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  seq: number;
  createdAt: Date;
}

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    athleteId: row.athleteId,
    kind: row.kind as ConversationKind,
    coachId: row.coachId,
    weeklySessionNumber: row.weeklySessionNumber,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role as MessageRole,
    content: row.content,
    seq: row.seq,
    createdAt: row.createdAt,
  };
}

/**
 * The next `seq` for a conversation. Messages are appended in order, so the next
 * sequence number is one past the current highest — or 0 for the first message.
 * Pure so it can be tested without a database.
 */
export function nextSeq(existing: { seq: number }[]): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((m) => m.seq)) + 1;
}

/**
 * The ownership gate (ADR 0006). A conversation reached by a client-supplied id
 * is only returned when it belongs to the athlete resolved from the server
 * session; anyone else's id resolves to null and the caller refuses it. Pure —
 * the decision is data in, decision out.
 */
export function ownedOrNull(
  conversation: Conversation | undefined,
  athleteId: string,
): Conversation | null {
  if (!conversation) return null;
  if (conversation.athleteId !== athleteId) return null;
  return conversation;
}

/**
 * The Coach Briefing's ownership gate (ADR 0006). A briefing is owned by the
 * *coach*, not the athlete: it is returned only when it is a `coach_briefing`
 * belonging to the coach resolved from the server session. Another coach's id —
 * or an athlete-owned conversation id — resolves to null and the caller refuses
 * it. The active Coaching Link is a *separate* gate the service re-checks on
 * every turn, so severing the link revokes access even to a briefing the coach
 * once owned. Pure — data in, decision out.
 */
export function coachOwnedOrNull(
  conversation: Conversation | undefined,
  coachId: string,
): Conversation | null {
  if (!conversation) return null;
  if (conversation.kind !== 'coach_briefing') return null;
  if (conversation.coachId !== coachId) return null;
  return conversation;
}

/**
 * A stored transcript, as the Anthropic API wants to see it.
 *
 * Every Coach conversation needs this and the mapping itself is the same in all
 * of them: the Coach's turns are the assistant's, everyone else's are the user's.
 * What differs is only whether a conversation opens with a **primer** — a fixed
 * first user turn that exists so the Coach has something to answer.
 *
 * The Weekly Session and the Coach Briefing both need one, because in those the
 * Coach speaks first and the API will not accept a history that opens with an
 * assistant turn. Coach Chat must NOT have one: there the athlete speaks first,
 * so a primer would fabricate a turn they never took.
 *
 * That difference is a value, so it is a parameter. Everything else is shared,
 * so it is written once. The primer is a prompt device and is never persisted —
 * it exists only for the length of one API call.
 */
export function toApiMessages(
  transcript: Message[],
  primer?: string,
): CoachMessage[] {
  const turns = transcript.map(
    (m): CoachMessage => ({
      role: m.role === 'coach_ai' ? 'assistant' : 'user',
      content: m.content,
    }),
  );
  return primer ? [{ role: 'user', content: primer }, ...turns] : turns;
}
