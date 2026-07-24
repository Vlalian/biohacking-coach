import type { ConversationRow, MessageRow } from '@/db/schema';

/** The six kinds of Coach conversation (schema check constraint mirrors this). */
export type ConversationKind =
  | 'weekly_session'
  | 'coach_chat'
  | 'negotiation'
  | 'reflection'
  | 'onboarding'
  | 'coach_briefing';

/** Who spoke a message. */
export type MessageRole = 'athlete' | 'coach_ai' | 'head_coach';

/**
 * A conversation as the app knows one — the stored row minus nothing it needs,
 * with `kind`/`role` narrowed to their closed sets at this boundary.
 */
export interface Conversation {
  id: string;
  athleteId: string;
  kind: ConversationKind;
  weeklySessionNumber: number | null;
  createdAt: Date;
  endedAt: Date | null;
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
