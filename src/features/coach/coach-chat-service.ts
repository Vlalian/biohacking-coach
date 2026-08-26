import { refusalReason } from '@/lib/identifiers';
import { logCoachFailure } from '@/lib/coach-log';
import type { Athlete } from '@/features/athlete/athlete';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import { getOwnedSession, getSessionsForWeek } from '@/features/session/session-repository';
import type { Session } from '@/features/session/session';
import { weekStartOf } from '@/lib/date';
import type { SessionContext } from './check-in';
import { weekFrom } from './week';
import { buildChatPrompt } from './prompts';
import { callCoach } from './coach-client';
import {
  appendMessages,
  createConversation,
  getLatestOpenConversation,
  getMessages,
  getOwnedConversation,
} from './conversation-repository';
import { toApiMessages, type Message } from './conversation';
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

// The same absence the Weekly Session carries: no Check-in feature exists, so
// there is no readiness to send, and the prompt says so rather than inventing one
// (code-health/07). Coach Chat asks in words what no number can tell it.
const NO_CHECK_IN: Readiness | null = null;

const CHAT_MAX_TOKENS = 1200;

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
 *
 * The athlete's current week is fetched the same way — athlete-scoped, from the
 * Monday of `today` — because Coach Chat is where "should I do tomorrow's
 * intervals?" gets asked, and a Coach that cannot see the week answers it
 * confidently anyway. The Weekly Session's prompt has always read the week; this
 * one did not until now.
 */
async function renderSystem(
  athlete: Athlete,
  today: string,
  language?: string,
  referenceSessionId?: string | null,
): Promise<string> {
  const [equipmentItems, weekSessions, reference] = await Promise.all([
    getEquipmentItems(athlete.id),
    getSessionsForWeek(athlete.id, weekStartOf(today)),
    referenceSessionId ? getOwnedSession(athlete.id, referenceSessionId) : Promise.resolve(undefined),
  ]);

  // `sessionCount` on a Coach Chat is coaching-relationship depth, the same as
  // the Weekly Session's — how many Weekly Sessions have come before. Passing 1
  // yields 0, the honest value for an athlete the Coach has not yet planned a
  // week with.
  const checkIn = buildWeeklyCheckIn(athlete, NO_CHECK_IN, 1, language, equipmentItems);

  // The Reference is matched against the week by id here, where ids still
  // exist; downstream of this call nothing knows what a session id is.
  return buildChatPrompt(
    checkIn,
    today,
    reference ? toSessionContext(reference) : null,
    weekFrom(weekSessions, reference?.id),
  );
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
  | { ok: false; reason: 'not-owner' | 'empty' | 'coach-unavailable' | 'unsafe-content' };

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

  let replyText: string;
  try {
    // `renderSystem` is inside the boundary too, not just the API call: it reads
    // the athlete's equipment and Reference and runs them through the prompt
    // builder's identifier assertion, which throws. A session note is free text
    // and unvalidated, so this is reachable — an athlete who typed an email into
    // one and then discussed that session would otherwise get an unhandled
    // rejection instead of an answer.
    const system = await renderSystem(athlete, today, language, referenceSessionId);
    replyText = (
      await callCoach({
        system,
        // The athlete's turn joins the history here rather than being stored
        // first — same messages the API would have seen, no orphan on failure.
        messages: [...toApiMessages(transcript), { role: 'user', content: trimmed }],
        maxTokens: CHAT_MAX_TOKENS,
      })
    ).text;
  } catch (error) {
    // Told apart deliberately: "the Coach could not be reached" invites a retry,
    // and retrying refused content just fails again. The athlete needs to know
    // which one happened.
    const reason = refusalReason(error);
    // The athlete sees a sentence; without this line the server saw nothing at
    // all, and a tester who churned after a failure looked exactly like a
    // tester who simply stopped caring (`showable-version/05`, item 2).
    logCoachFailure({
      surface: 'coach_chat',
      athleteId: athlete.id,
      conversationId,
      error,
      reason,
    });
    return { ok: false, reason };
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

