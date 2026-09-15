import type { Athlete } from '@/features/athlete/athlete';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import { getOwnedSession, getSessionsForWeek } from '@/features/session/session-repository';
import type { Session } from '@/features/session/session';
import { weekStartOf } from '@/lib/date';
import type { SessionContext } from './check-in';
import { weekFrom } from './week';
import { buildChatPrompt } from './prompts';
import { takeConversationTurn, type ConversationTurnResult } from './conversation-turn';
import { getLatestOpenConversation, getMessages } from './conversation-repository';
import type { Message } from './conversation';
import { getRaces, getTargetRace } from '@/features/race/race-repository';
import { getLatestPlanWrittenAt } from './plan-proposal-repository';
import { productionGrounding } from './grounding';
import { capacityFor } from '@/features/health/health-repository';
import { getCheckInForWeek } from './check-in-repository';
import { notableSignalFrom, readinessFrom } from './check-in';
import { buildWeeklyCheckIn } from './weekly-session';

/**
 * Coach Chat — the Coach Overlay's *baseline* mode (ADR 0007): the open-ended,
 * athlete-led conversation the Coach is having whenever it is not running a
 * structured behavior. Not a separate room; the Weekly Session is entered from
 * inside the same surface.
 *
 * Server-side orchestration only. A turn is taken by
 * {@link takeConversationTurn}, which reaches `coach-client` (and so
 * `server-only`) and keeps this module off the client by construction. What is
 * left here is the part that is Coach Chat and not a turn: the prompt, and the
 * Reference the athlete brought into the thread. The athlete is always resolved
 * from the authenticated session upstream; a client-supplied conversation or
 * session id is checked against that owner by the repository, never trusted
 * (ADR 0006).
 *
 * Unlike the Weekly Session, a Coach Chat is never "ended" by the app — it is
 * the resting conversation, so it stays open and is resumed on every visit.
 */

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
): Promise<{ system: string; phase: string | null; experienceLevel: string | null }> {
  const [
    equipmentItems,
    weekSessions,
    reference,
    targetRace,
    checkInRow,
    races,
    planWrittenAt,
    capacity,
  ] = await Promise.all([
    getEquipmentItems(athlete.id),
    getSessionsForWeek(athlete.id, weekStartOf(today)),
    referenceSessionId
      ? getOwnedSession(athlete.id, referenceSessionId)
      : Promise.resolve(undefined),
    // The same horizon the Weekly Session reads. Chat is where "should I do
    // tomorrow's intervals?" gets asked, and the answer depends on how far out
    // the race is — a Coach with no horizon here would contradict the one the
    // athlete just planned a week with.
    getTargetRace(athlete.id),
    // The same Check-in the Weekly Session reads. Chat is where "should I do
    // tomorrow's intervals?" gets asked, and an athlete who reported low energy
    // on Monday should not have to say it again on Wednesday.
    getCheckInForWeek(athlete.id, weekStartOf(today)),
    // Slice 09: the same tune-up and late-race lines the Weekly Session renders.
    getRaces(athlete.id),
    getLatestPlanWrittenAt(athlete.id, weekStartOf(today)),
    // What the athlete's body currently allows — the capacity half only, as
    // the Weekly Session reads it (training-architecture/06; CodeRabbit on PR
    // #60 found Chat knew nothing of it). The detail thread has no reader here.
    capacityFor(athlete.id),
  ]);

  // `sessionCount` on a Coach Chat is coaching-relationship depth, the same as
  // the Weekly Session's — how many Weekly Sessions have come before. Passing 1
  // yields 0, the honest value for an athlete the Coach has not yet planned a
  // week with.
  const checkIn = buildWeeklyCheckIn(
    athlete,
    today,
    readinessFrom(checkInRow),
    1,
    language,
    equipmentItems,
    targetRace ? { name: targetRace.name, date: targetRace.date } : null,
    capacity,
    // The athlete's own sentence, for the same reason Chat reads the Check-in at
    // all: someone who wrote "calf tight since Tuesday" on Monday should not
    // have to say it again on Wednesday.
    notableSignalFrom(checkInRow),
    races,
    planWrittenAt,
  );

  // The Reference is matched against the week by id here, where ids still
  // exist; downstream of this call nothing knows what a session id is.
  return {
    system: buildChatPrompt(
      checkIn,
      today,
      reference ? toSessionContext(reference) : null,
      weekFrom(weekSessions, reference?.id),
    ),
    // What the grounding folds into its query: where in the season the athlete
    // is, and how experienced — the same facts the prompt just rendered.
    ...groundingFactsOf(checkIn),
  };
}

/** The two Check-in facts the grounding's query wants, absent rendered as null. */
function groundingFactsOf(checkIn: {
  phase?: string;
  experienceLevel?: string;
}): { phase: string | null; experienceLevel: string | null } {
  return { phase: checkIn.phase ?? null, experienceLevel: checkIn.experienceLevel ?? null };
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

export type SendChatResult = ConversationTurnResult;

/**
 * Sends the athlete's turn and returns the Coach's reply, creating the chat on
 * first use. `referenceSessionId` is the Session the athlete is asking about
 * (the Coach Overlay's Reference); it conditions the prompt for this turn only,
 * which matches how the athlete experiences it — they tapped a session, asked
 * about it, and may then move on.
 *
 * Refuses an empty message, a conversation that is not this athlete's, and a
 * Coach that could not be reached — all of that, and the ordering guarantee that
 * nothing is written until the Coach has answered, belong to
 * {@link takeConversationTurn}.
 *
 * `renderSystem` runs inside that turn's failure boundary rather than before it,
 * and deliberately: it reads the athlete's equipment and Reference and runs them
 * through the prompt builder's identifier assertion, which throws. A session
 * note is free text and unvalidated, so this is reachable — an athlete who typed
 * an email into one and then discussed that session would otherwise get an
 * unhandled rejection instead of an answer.
 */
export async function sendCoachChatMessage(
  athlete: Athlete,
  conversationId: string | null,
  content: string,
  today: string,
  language?: string,
  referenceSessionId?: string | null,
): Promise<SendChatResult> {
  return takeConversationTurn({
    athleteId: athlete.id,
    kind: 'coach_chat',
    surface: 'coach_chat',
    conversationId,
    content,
    maxTokens: CHAT_MAX_TOKENS,
    prepare: async (_transcript, conversationId) => {
      const { system, phase, experienceLevel } = await renderSystem(
        athlete,
        today,
        language,
        referenceSessionId,
      );
      // One grounding per turn (`knowledge-oracle/05`): the lookup tool, its
      // resolver, and — after the model has answered — the citations it earned.
      const grounding = productionGrounding({
        athleteId: athlete.id,
        surface: 'coach_chat',
        conversationId,
        phase,
        experienceLevel,
      });
      return {
        system,
        tools: [grounding.tool],
        resolveTool: grounding.resolve,
        citations: () => grounding.citations(),
      };
    },
  });
}
