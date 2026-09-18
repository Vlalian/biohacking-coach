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
import { getRaces } from '@/features/race/race-repository';
import { getLatestPlanWrittenAt } from './plan-proposal-repository';
import { productionGrounding } from './grounding';
import { proposalTurnTools } from './proposal-tools';
import { capacityFor } from '@/features/health/health-repository';
import { getResolvedBlocks } from './training-block-service';
import { getCheckInForWeek } from './check-in-repository';
import { notableSignalFrom, readinessFrom } from './check-in';
import {
  buildWeeklyCheckIn,
  fixedConstraintsOf,
  validateProposedPlan,
  PROPOSE_WEEK_PLAN_TOOL_NAME,
  type ProposedSession,
} from './weekly-session';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { getPendingProposal, recordProposal } from './plan-proposal-repository';
import { getDiscussedWeek } from './week-draft-repository';
import { conversationWindow } from './week-draft';
import type { PlanningWindow } from './planning-window';
import type { CoachReply } from './coach-client';

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

/**
 * Room for a whole-week proposal plus a paragraph. 1200 until 2026-09-17, when
 * Mads's smoke run of PR #71 hit it four times: a `propose_week_plan` call for
 * seven days is large, and a reply cut off mid-call comes back empty. Raised
 * rather than retried — a retry doubles a twenty-second wait — and a cut-off is
 * now its own refusal (`ran-out-of-room`) so the athlete is asked for less.
 */
const CHAT_MAX_TOKENS = 2500;

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
  conversationId: string | null = null,
  preferredName: string | null = null,
): Promise<{ system: string; window: PlanningWindow }> {
  const [
    equipmentItems,
    weekSessions,
    reference,
    horizon,
    checkInRow,
    races,
    planWrittenAt,
    capacity,
    unavailableDates,
    facts,
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
    getResolvedBlocks(athlete.id, today),
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
    // The window the chat may write into needs the athlete's days off, the same
    // list the Weekly Session reads (`training-architecture/20`).
    getUnavailableDates(athlete.id),
    conversationFacts(athlete.id, conversationId),
  ]);

  // The week this conversation may propose: the whole of a week brought in to
  // discuss, else this week's remainder. Chosen here, by the server, and told
  // to the Coach as a bound — never offered as a question (ADR 0007, amended
  // 2026-09-16).
  const window = conversationWindow(today, facts.discussedWeek, fixedConstraintsOf(athlete), unavailableDates);

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
    horizon.race ? { name: horizon.race.name, date: horizon.race.date } : null,
    capacity,
    // The athlete's own sentence, for the same reason Chat reads the Check-in at
    // all: someone who wrote "calf tight since Tuesday" on Monday should not
    // have to say it again on Wednesday.
    notableSignalFrom(checkInRow),
    races,
    planWrittenAt,
    // The same resolved blocks the Weekly Session plans inside, so Chat names
    // the same phase the athlete just planned a week with.
    horizon.blocks,
  );

  // The Reference is matched against the week by id here, where ids still
  // exist; downstream of this call nothing knows what a session id is.
  return {
    system: buildChatPrompt(
      checkIn,
      today,
      reference ? toSessionContext(reference) : null,
      weekFrom(weekSessions, reference?.id),
      { window, stagedProposal: facts.staged },
      // The one name that reaches the prompt by choice (`preferred-name/02`):
      // resolved at the user seam by the action and threaded here as plain
      // data, beside the language and for the same reason.
      preferredName,
    ),
    window,
  };
}

/**
 * What an existing conversation already carries: the week a draft was brought
 * in to discuss, and the proposal still awaiting a decision. A first turn has
 * no conversation yet, so it carries neither and reads nothing.
 */
async function conversationFacts(
  athleteId: string,
  conversationId: string | null,
): Promise<{ discussedWeek: string | null; staged: ProposedSession[] | null }> {
  const [discussedWeek, pending] = await Promise.all([
    conversationId ? getDiscussedWeek(athleteId, conversationId) : null,
    conversationId ? getPendingProposal(athleteId, conversationId) : null,
  ]);
  return { discussedWeek, staged: pending ? pending.sessions : null };
}

/** The proposal a chat turn is awaiting a decision on, as the card shows it. */
export interface ChatProposal {
  sessions: ProposedSession[];
}

/**
 * Stages the Coach's proposed week, when it proposed one the server accepts —
 * called only once the turn is safely stored, the same rule as the Weekly
 * Session's `stageProposal`. An invalid proposal is not staged; the Coach's
 * text still shows and the conversation continues.
 */
async function stageChatProposal(
  athleteId: string,
  conversationId: string,
  window: PlanningWindow,
  reply: CoachReply,
): Promise<ChatProposal | null> {
  const call = reply.toolCalls.find((c) => c.name === PROPOSE_WEEK_PLAN_TOOL_NAME);
  if (!call) return null;
  const validated = validateProposedPlan(call.input, window);
  if (!validated.ok) return null;
  await recordProposal(athleteId, conversationId, validated.sessions);
  return { sessions: validated.sessions };
}

export interface CoachChatState {
  conversationId: string;
  messages: Message[];
  /** The week awaiting the athlete's decision, restored with the transcript (`/20`). */
  proposal: ChatProposal | null;
}

/**
 * The athlete's open Coach Chat, resumed — or null if they have never opened
 * one. Read-only: opening the overlay must not mint a conversation or call the
 * API, so a chat is created lazily on the first message instead. A pending
 * proposal comes back with the transcript, so a refresh mid-decision does not
 * lose the card.
 */
export async function getOpenCoachChat(athleteId: string): Promise<CoachChatState | null> {
  const open = await getLatestOpenConversation(athleteId, 'coach_chat');
  return open ? chatStateOf(athleteId, open.id) : null;
}

/**
 * A known Coach Chat, as the overlay restores it: the transcript and the week
 * awaiting a decision, read together. The app shell already knows which chat
 * is open from its one cross-kind query, so it calls this rather than
 * {@link getOpenCoachChat}; both read the same shape from one place (the
 * review of `training-architecture/20` found it written twice).
 */
export async function chatStateOf(athleteId: string, conversationId: string): Promise<CoachChatState> {
  const [messages, pending] = await Promise.all([
    getMessages(conversationId),
    getPendingProposal(athleteId, conversationId),
  ]);
  return { conversationId, messages, proposal: pending ? { sessions: pending.sessions } : null };
}

export type SendChatResult =
  | (Extract<ConversationTurnResult, { ok: true }> & { proposal: ChatProposal | null })
  | Extract<ConversationTurnResult, { ok: false }>;

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
  /** What the athlete chose for the Coach to call them, or null (`preferred-name/02`). */
  preferredName: string | null = null,
): Promise<SendChatResult> {
  // What this turn staged, if anything — filled in after the store, read after
  // the turn. Null on every turn where the Coach proposed nothing.
  let proposal: ChatProposal | null = null;
  const result = await takeConversationTurn({
    athleteId: athlete.id,
    kind: 'coach_chat',
    surface: 'coach_chat',
    conversationId,
    content,
    maxTokens: CHAT_MAX_TOKENS,
    prepare: async (_transcript, conversationId) => {
      const { system, window } = await renderSystem(
        athlete,
        today,
        language,
        referenceSessionId,
        conversationId,
        preferredName,
      );
      // One grounding per turn (`knowledge-oracle/05`): the lookup tool, its
      // resolver, and — after the model has answered — the citations it earned.
      const grounding = productionGrounding({
        athleteId: athlete.id,
        surface: 'coach_chat',
        conversationId,
      });
      return {
        system,
        // The week proposal beside the lookup (`training-architecture/20`): the
        // one conversation may agree a week, and the athlete taps to decide.
        ...proposalTurnTools(grounding),
        citations: () => grounding.citations(),
        onStored: async (id, reply) => {
          proposal = await stageChatProposal(athlete.id, id, window, reply);
        },
      };
    },
  });
  return result.ok ? { ...result, proposal } : result;
}
