import { weekStartOf } from '@/lib/date';
import type { Athlete } from '@/features/athlete/athlete';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import { getOwnedSession, getSessionsForWeek } from '@/features/session/session-repository';
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
  | { ok: false; reason: 'not-owner' | 'empty' };

/**
 * Sends the athlete's turn and returns the Coach's reply, creating the chat on
 * first use. `referenceSessionId` is the Session the athlete is asking about
 * (the Coach Overlay's Reference); it conditions the prompt for this turn only,
 * which matches how the athlete experiences it — they tapped a session, asked
 * about it, and may then move on.
 *
 * Refuses an empty message, and a conversation that is not this athlete's.
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

  let id = conversationId;
  if (id) {
    const owned = await getOwnedConversation(athlete.id, id);
    if (!owned) return { ok: false, reason: 'not-owner' };
  } else {
    // Lazily created: the resting conversation costs nothing until it is used.
    const created = await createConversation({ athleteId: athlete.id, kind: 'coach_chat' });
    id = created.id;
  }

  const afterAthlete = await appendMessages(athlete.id, id, [
    { role: 'athlete', content: trimmed },
  ]);
  if (!afterAthlete) return { ok: false, reason: 'not-owner' };

  const system = await renderSystem(athlete, today, language, referenceSessionId);
  const reply = await callCoach({
    system,
    messages: toChatApiMessages(await getMessages(id)),
    maxTokens: CHAT_MAX_TOKENS,
  });

  await appendMessages(athlete.id, id, [{ role: 'coach_ai', content: reply.text }]);

  return { ok: true, conversationId: id, messages: await getMessages(id) };
}

/**
 * Whether the Coach should offer the Weekly Session today — the single
 * sanctioned proactive nudge (ADR 0007: "Offered every week, forced never").
 *
 * True only on the athlete's stored Weekly Session Day, and only when they have
 * not already planned this week. "Flexible" (or unset) means no preferred day,
 * so no nudge — an athlete who declined to name a day is not asking to be
 * chased; they can still start one whenever they like.
 *
 * Pure given its inputs: the caller supplies today's weekday and the week's
 * sessions, so this is decided without a clock or a query of its own.
 */
export function shouldOfferWeeklySession(params: {
  weeklySessionDay: string | null | undefined;
  todayWeekday: string;
  hasCoachPlannedThisWeek: boolean;
}): boolean {
  const { weeklySessionDay, todayWeekday, hasCoachPlannedThisWeek } = params;
  if (!weeklySessionDay || weeklySessionDay === 'Flexible') return false;
  if (weeklySessionDay !== todayWeekday) return false;
  return !hasCoachPlannedThisWeek;
}

/** Whether this week already holds a Coach-planned session — the nudge's "already done" test. */
export async function hasCoachPlanForWeek(athleteId: string, today: string): Promise<boolean> {
  const weekSessions = await getSessionsForWeek(athleteId, weekStartOf(today));
  return weekSessions.some((s) => s.origin === 'coach');
}
