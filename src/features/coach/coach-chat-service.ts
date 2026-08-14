import type { Athlete } from '@/features/athlete/athlete';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import { getOwnedSession } from '@/features/session/session-repository';
import type { Session } from '@/features/session/session';
import type { SessionContext } from './check-in';
import { buildChatPrompt } from './prompts';
import { callCoach, type CoachMessage } from './coach-client';
import {
  appendMessages,
  createConversation,
  getLatestOpenConversation,
  getMessages,
  getOwnedConversation,
} from './conversation-repository';
import type { Message } from './conversation';
import { buildWeeklyCheckIn, type Readiness } from './weekly-session';

/**
 * Coach Chat — the Coach Overlay's *baseline* mode (ADR 0007): the open-ended,
 * athlete-led conversation the Coach is having whenever it is not running a
 * structured behavior. Not a separate room; the Weekly Session is entered from
 * inside the same surface.
 *
 * Server-side orchestration only, mirroring {@link weekly-session-service}:
 * importing {@link callCoach} (which is `server-only`) keeps this module off
 * the client by construction. The athlete is always resolved from the
 * authenticated session upstream; a client-supplied conversation or session id
 * is checked against that owner by the repository, never trusted (ADR 0006).
 *
 * Unlike the Weekly Session, a Coach Chat is never "ended" by the app — it is
 * the resting conversation, so it stays open and is resumed on every visit.
 */

// The same neutral baseline the Weekly Session uses until a daily Check-in
// feature exists. Coach Chat asks in words what the numbers do not know.
const BASELINE_READINESS: Readiness = {
  body: 7,
  mental: 7,
  energy: 7,
  sleep: 7.5,
  pulse: 55,
};

const CHAT_MAX_TOKENS = 1200;

/**
 * Renders a stored chat transcript into the alternating history the Anthropic
 * API expects.
 *
 * Deliberately not {@link weekly-session}'s `toApiMessages`: that one prepends
 * a fixed user-turn primer because the Coach speaks first in a Weekly Session.
 * In Coach Chat the *athlete* speaks first, so a primer would fabricate a turn
 * they never took.
 */
export function toChatApiMessages(transcript: Message[]): CoachMessage[] {
  return transcript.map((m): CoachMessage => ({
    role: m.role === 'coach_ai' ? 'assistant' : 'user',
    content: m.content,
  }));
}

/** The Reference the athlete brought into the thread, as the prompt sees it. */
function toSessionContext(session: Session): SessionContext {
  return {
    type: session.type,
    dayLabel: session.date,
    duration: session.duration ? `${session.duration} min` : '—',
    zone: session.zone ?? '—',
    note: session.note ?? '',
    status: session.status,
  };
}

/**
 * Renders the Coach Chat system prompt for this athlete, optionally about the
 * Session they brought in as a Reference.
 *
 * The Reference is resolved here, from its id, through an athlete-scoped query
 * — so a forged id yields no Reference rather than another athlete's session.
 * No name or email is assembled into the check-in (GDPR decision 1 lives in
 * {@link buildWeeklyCheckIn}, which this reuses precisely so the guarantee is
 * enforced once rather than re-implemented).
 */
async function renderSystem(
  athlete: Athlete,
  today: string,
  language?: string,
  referenceSessionId?: string | null,
): Promise<string> {
  const [equipmentItems, reference] = await Promise.all([
    getEquipmentItems(athlete.id),
    referenceSessionId ? getOwnedSession(athlete.id, referenceSessionId) : Promise.resolve(undefined),
  ]);

  // `sessionCount` on a Coach Chat is coaching-relationship depth, the same as
  // the Weekly Session's — how many Weekly Sessions have come before. Passing 1
  // yields 0, the honest value for an athlete the Coach has not yet planned a
  // week with.
  const checkIn = buildWeeklyCheckIn(athlete, BASELINE_READINESS, 1, language, equipmentItems);

  return buildChatPrompt(checkIn, today, reference ? toSessionContext(reference) : null);
}

export interface CoachChatState {
  conversationId: string;
  messages: Message[];
}

/**
 * The athlete's open Coach Chat, resumed — or null if they have never opened
 * one. Read-only: opening the overlay must not mint a conversation or call the
 * API, so a chat is created lazily on the first message instead.
 */
export async function getOpenCoachChat(athleteId: string): Promise<CoachChatState | null> {
  const open = await getLatestOpenConversation(athleteId, 'coach_chat');
  if (!open) return null;
  return { conversationId: open.id, messages: await getMessages(open.id) };
}

export type SendChatResult =
  | { ok: true; conversationId: string; messages: Message[] }
  | { ok: false; reason: 'not-owner' | 'empty' | 'coach-unavailable' };

/**
 * Sends the athlete's turn and returns the Coach's reply, creating the chat on
 * first use. `referenceSessionId` is the Session the athlete is asking about
 * (the Coach Overlay's Reference); it conditions the prompt for this turn only,
 * which matches how the athlete experiences it — they tapped a session, asked
 * about it, and may then move on.
 *
 * Refuses an empty message, a conversation that is not this athlete's, and a
 * Coach that could not be reached.
 *
 * **Nothing is written until the Coach has answered.** The turn and the reply
 * land together, in one append, after the API call returns. Persisting the
 * athlete's message first is the obvious order and the wrong one: the Anthropic
 * call is the step that realistically fails, and doing it second leaves a
 * transcript holding a question with no answer — which the athlete cannot retry
 * without their message appearing twice. Failing before any write means the
 * client can simply hand the draft back (`coach-chat.tsx`), and the conversation
 * is exactly as it was.
 */
export async function sendCoachChatMessage(
  athlete: Athlete,
  conversationId: string | null,
  content: string,
  today: string,
  language?: string,
  referenceSessionId?: string | null,
): Promise<SendChatResult> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  // Ownership is checked before any work: a forged conversation id must not
  // reach a prompt or an API call, let alone a write (ADR 0006).
  const existing = conversationId
    ? await getOwnedConversation(athlete.id, conversationId)
    : null;
  if (conversationId && !existing) return { ok: false, reason: 'not-owner' };

  const transcript = conversationId ? await getMessages(conversationId) : [];
  const system = await renderSystem(athlete, today, language, referenceSessionId);

  let replyText: string;
  try {
    replyText = (
      await callCoach({
        system,
        // The athlete's turn joins the history here rather than being stored
        // first — same messages the API would have seen, no orphan on failure.
        messages: [...toChatApiMessages(transcript), { role: 'user', content: trimmed }],
        maxTokens: CHAT_MAX_TOKENS,
      })
    ).text;
  } catch {
    return { ok: false, reason: 'coach-unavailable' };
  }

  // Lazily created: the resting conversation costs nothing until it is used,
  // and a Coach that never answered should not mint an empty one.
  const id =
    conversationId ??
    (await createConversation({ athleteId: athlete.id, kind: 'coach_chat' })).id;

  const appended = await appendMessages(athlete.id, id, [
    { role: 'athlete', content: trimmed },
    { role: 'coach_ai', content: replyText },
  ]);
  if (!appended) return { ok: false, reason: 'not-owner' };

  return { ok: true, conversationId: id, messages: await getMessages(id) };
}

/**
 * Whether the Coach should offer the Weekly Session today — the single
 * sanctioned proactive nudge (ADR 0007: "Offered every week, forced never").
 *
 * True only on the athlete's stored Weekly Session Day, and only when they have
 * not already *held* a Weekly Session this week. "Flexible" (or unset) means no
 * preferred day, so no nudge — an athlete who declined to name a day is not
 * asking to be chased; they can still start one whenever they like.
 *
 * The "already done" test is the conversation, not the plan. A week that has a
 * plan is not a week that has been discussed: once generation lands, an
 * auto-drafted week must still be offered, or generation would silence its own
 * offer (coach-overlay issue 04, decision 4).
 *
 * Pure given its inputs: the caller supplies today's weekday and the answer to
 * the "already held" question, so this is decided without a clock or a query.
 */
export function shouldOfferWeeklySession(params: {
  weeklySessionDay: string | null | undefined;
  todayWeekday: string;
  hasHeldWeeklySessionThisWeek: boolean;
}): boolean {
  const { weeklySessionDay, todayWeekday, hasHeldWeeklySessionThisWeek } = params;
  if (!weeklySessionDay || weeklySessionDay === 'Flexible') return false;
  if (weeklySessionDay !== todayWeekday) return false;
  return !hasHeldWeeklySessionThisWeek;
}
