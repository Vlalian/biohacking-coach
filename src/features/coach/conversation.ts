import type { ConversationRow, MessageRow } from '@/db/schema';

/**
 * The four kinds of Coach conversation (the schema check constraint mirrors this).
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
 */
export type ConversationKind =
  | 'weekly_session'
  | 'coach_chat'
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
  /** The owning coach for a `coach_briefing`; null for athlete-owned kinds. */
  coachId: string | null;
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
