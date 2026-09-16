import { refusalReason } from '@/lib/identifiers';
import { logCoachFailure } from '@/lib/coach-log';
import { weekStartOf } from '@/lib/date';
import type { Athlete } from '@/features/athlete/athlete';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import {
  getSessionsForWeek,
  replaceCoachPlanForDateRange,
} from '@/features/session/session-repository';
import { buildWeeklyContext, renderWeeklyPrompt } from './prompts';
import { planningWindow, type PlanningWindow } from './planning-window';
import { callCoach, type CoachReply } from './coach-client';
import {
  appendMessages,
  countWeeklySessions,
  createConversation,
  deleteOwnedConversation,
  endConversation,
  getMessages,
  getOwnedConversation,
} from './conversation-repository';
import type { Message } from './conversation';
import {
  getPendingProposal,
  recordPlanCommitted,
  recordPlanDeclined,
  recordProposal,
} from './plan-proposal-repository';
import { getResolvedBlocks } from './training-block-service';
import { getCheckInForWeek } from './check-in-repository';
import { capacityFor } from '@/features/health/health-repository';
import { readinessFrom, notableSignalFrom } from './check-in';
import {
  buildWeeklyCheckIn,
  proposedToNewSessionRows,
  skippedFrom,
  toWeeklyApiMessages,
  validateProposedPlan,
  weekFeedbackFrom,
  PROPOSE_WEEK_PLAN_TOOL,
  PROPOSE_WEEK_PLAN_TOOL_NAME,
  WEEKLY_OPENER,
  type ProposedSession,
} from './weekly-session';

/**
 * The Weekly Session's server-side orchestration — the edge that wires the pure
 * flow logic ({@link weekly-session}) and prompt rendering to the conversation
 * repository and the Anthropic adapter. Importing {@link callCoach} (which is
 * `server-only`) keeps this module off the client by construction.
 *
 * Every entry point takes the athlete resolved from the authenticated session
 * upstream; a client-supplied conversation id is only ever passed to the
 * repository, which checks it against that owner and refuses another athlete's
 * (ADR 0006).
 *
 * The Coach never writes the calendar. When it and the athlete agree on a week,
 * the Coach calls the `propose_week_plan` tool; that only *stages* a proposal,
 * which the athlete then confirms or cancels. The server is the authority on what
 * lands ({@link commitWeeklyPlan}), and it replaces only coach-planned days.
 */



const WEEKLY_MAX_TOKENS = 1400;

// What the Coach is told after it proposes a plan: the plan is not saved, the
// athlete decides. This keeps the Coach from claiming the week is done.
const PROPOSAL_ACK =
  'The plan has been shown to the athlete to confirm or cancel. Acknowledge briefly and ' +
  'invite them to confirm when ready. Do not say it has been saved.';


/**
 * The window this athlete's plan may be written into, today.
 *
 * Derived here rather than passed in, so both the staging path and the commit
 * path ask the same question of the same rule (`showable-version/11`), and so a
 * proposal that has drifted out of its window between being staged and being
 * confirmed comes back `stale` rather than being written.
 */
function planningWindowFor(
  athlete: Athlete,
  today: string,
  unavailableDates: string[],
): PlanningWindow {
  return planningWindow(
    today,
    // Stryker disable next-line ArrayDeclaration: equivalent. A Fixed Constraint
    // is matched by weekday name, so a non-weekday default matches no day and
    // yields the same window as an empty one.
    athlete.profile?.fixedConstraints ?? [],
    unavailableDates,
  );
}

/**
 * Renders the Weekly Session system prompt for this athlete, reviewing the week
 * just lived. The Coach reads that week's Session Reflections (rated sessions)
 * and skips; no name or email is ever assembled into the check-in (GDPR
 * decision 1 lives in {@link buildWeeklyCheckIn}).
 */
async function renderSystem(
  athlete: Athlete,
  weeklySessionNumber: number,
  today: string,
  unavailableDates: string[],
  language?: string,
  /** The drafted week already staged on this conversation (`/18`, "discuss"); null on every other session. */
  stagedProposal: ProposedSession[] | null = null,
): Promise<string> {
  const weekStart = weekStartOf(today);
  const [weekSessions, equipmentItems, horizon, checkInRow, capacity] = await Promise.all([
    getSessionsForWeek(athlete.id, weekStart),
    getEquipmentItems(athlete.id),
    // The horizon: the Target Race and the Training Blocks resolved for it —
    // the Coach-shaped set when one exists, the arithmetic draft when not
    // (`training-architecture/07`). A null race is an ordinary answer, and the
    // prompt says so rather than omitting the subject.
    getResolvedBlocks(athlete.id, today),
    // The athlete's own report of how they arrive at this week. Null most weeks
    // — the Weekly Session is not a gate (ADR 0007) — and the prompt says so
    // rather than inventing scores, which is what it did before code-health/07.
    getCheckInForWeek(athlete.id, weekStart),
    // What the athlete's body currently allows. Only the capacity half is read;
    // the detail thread has no reader on this path at all (ADR 0011).
    capacityFor(athlete.id),
  ]);
  const checkIn = buildWeeklyCheckIn(
    athlete,
    today,
    readinessFrom(checkInRow),
    weeklySessionNumber,
    language,
    equipmentItems,
    horizon.race ? { name: horizon.race.name, date: horizon.race.date } : null,
    capacity,
    notableSignalFrom(checkInRow),
    horizon.blocks,
  );
  // The inputs with a real source: the week's Session Reflections (feedback),
  // its skips, and — since showable-version/15 — the athlete's Unavailable
  // Dates, which slice 14 has provided since before this call was written. The
  // Head Coach's Roster had been reading them the whole time; only the
  // athlete's own Coach was not, so the `UNAVAILABLE:` line had never rendered
  // and the Coach planned onto days the athlete had marked off.
  //
  // The two still-empty inputs are empty because their sources do not exist yet:
  // sessionHistory (Silent Pattern Insight) needs *multi-week* Check-in history,
  // and this week's is the first one there has ever been; weekActivity has no
  // producer anywhere in `src/`. The prompt renders each block conditionally, so
  // an empty input simply omits it.
  const ctx = buildWeeklyContext(
    checkIn,
    weekFeedbackFrom(weekSessions),
    // Stryker disable next-line ArrayDeclaration: equivalent. `detectPatterns`
    // returns [] below PATTERN_THRESHOLDS.minOccurrences (3), so a one-element
    // history is indistinguishable from none. See showable-version/15 for why
    // this argument is empty at all.
    [],
    skippedFrom(weekSessions),
    unavailableDates,
    null,
    today,
  );
  return renderWeeklyPrompt(stagedProposal ? { ...ctx, stagedProposal } : ctx);
}

/** The proposal a Weekly Session is currently awaiting a decision on. */
export interface PlanProposal {
  sessions: ProposedSession[];
}

export interface WeeklySessionState {
  conversationId: string;
  weeklySessionNumber: number;
  messages: Message[];
  proposal: PlanProposal | null;
  endedAt: Date | null;
}

export type StartWeeklySessionResult =
  | ({ ok: true } & WeeklySessionState)
  | { ok: false; reason: 'coach-unavailable' | 'unsafe-content' | 'failed' };

/**
 * Opens a new Weekly Session: the Coach speaks first, and it is persisted.
 *
 * The conversation is created only *after* the Coach has actually spoken. Minted
 * first, a failed or empty opening turn would leave an empty Weekly Session in
 * the athlete's history — counted by `countWeeklySessions`, which decides the
 * Presence Arc stage, so a failed start would silently advance the relationship
 * a week.
 */
export async function startWeeklySession(
  athlete: Athlete,
  today: string,
  language?: string,
  /** `stagedProposal`: the drafted week the athlete brought in from the calendar (`/18`). */
  options: { stagedProposal?: ProposedSession[] } = {},
): Promise<StartWeeklySessionResult> {
  const weeklySessionNumber = (await countWeeklySessions(athlete.id)) + 1;
  // Read once per turn and threaded from here: the prompt (`renderSystem`)
  // and the planning window (`planningWindowFor`) both need this list, and each
  // fetching it for itself is two round trips for one answer.
  const unavailableDates = await getUnavailableDates(athlete.id);

  let reply: CoachReply;
  try {
    // Prompt rendering inside the boundary with the call — it asserts on free
    // text and throws, same as in `continueWeeklySession`.
    const system = await renderSystem(
      athlete,
      weeklySessionNumber,
      today,
      unavailableDates,
      language,
      options.stagedProposal ?? null,
    );
    reply = await callCoach({
      system,
      messages: [{ role: 'user', content: WEEKLY_OPENER }],
      maxTokens: WEEKLY_MAX_TOKENS,
    });
  } catch (error) {
    const reason = refusalReason(error);
    logCoachFailure({
      surface: 'weekly_session',
      athleteId: athlete.id,
      // No conversation exists yet: it is minted only after the Coach has
      // actually spoken, so a failed opening turn has nothing to point at.
      conversationId: null,
      error,
      reason,
    });
    return {
      ok: false,
      reason,
    };
  }

  const conversation = await createConversation({
    athleteId: athlete.id,
    kind: 'weekly_session',
    weeklySessionNumber,
  });
  const messages = await appendMessages(athlete.id, conversation.id, [
    { role: 'coach_ai', content: reply.text },
  ]);
  if (!messages) {
    // Returning `failed` is not enough on its own: the row already exists, and
    // `countWeeklySessions` counts it by kind, not by message count — so an
    // unusable session would still advance the Presence Arc a week. (An earlier
    // version of this comment claimed the ordering above prevented that. It
    // prevented the row being created on a *failed Coach call*; it did nothing
    // about a failed append.) Remove the row, then report.
    await deleteOwnedConversation(athlete.id, conversation.id);
    return { ok: false, reason: 'failed' };
  }

  return {
    ok: true,
    conversationId: conversation.id,
    weeklySessionNumber,
    messages,
    proposal: null,
    endedAt: null,
  };
}

/** Why a continuing turn was refused. Named so the Coach-call boundary can return it. */
export type ContinueRefusal = 'not-owner' | 'empty' | 'coach-unavailable' | 'unsafe-content';

export type ContinueResult =
  | { ok: true; messages: Message[]; proposal: PlanProposal | null }
  | { ok: false; reason: ContinueRefusal };

/**
 * Stages the Coach's proposed week, when it proposed one the server will accept.
 *
 * Called only once the turn is safely stored: the server is the authority on
 * what is a legal week (ADR 0003), and a proposal recorded against a turn that
 * failed to persist would outlive the conversation it belongs to. An invalid
 * proposal is simply not staged — the Coach's text still shows, and the
 * conversation continues.
 */
async function stageProposal(
  athlete: Athlete,
  conversationId: string,
  today: string,
  unavailableDates: string[],
  reply: CoachReply,
): Promise<PlanProposal | null> {
  const call = reply.toolCalls.find((c) => c.name === PROPOSE_WEEK_PLAN_TOOL_NAME);
  if (!call) return null;

  const validated = validateProposedPlan(call.input, planningWindowFor(athlete, today, unavailableDates));
  if (!validated.ok) return null;

  await recordProposal(athlete.id, conversationId, validated.sessions);
  return { sessions: validated.sessions };
}

/**
 * One continuing turn's Coach call, with its failure boundary.
 *
 * `renderSystem` is inside the boundary too, not just the API call: it asserts
 * on athlete free text and throws (`assertNoDirectIdentifier`). Leaving it
 * outside was the exact mistake this branch fixed in Coach Chat.
 *
 * Refused content and an unreachable Coach are different problems and get
 * different answers, the same split Coach Chat makes: "try again" is useless
 * advice for text that will be refused identically every time.
 */
async function askCoach(params: {
  athlete: Athlete;
  conversationId: string;
  /** Null on a conversation stored before the number was tracked; read as the first. */
  weeklySessionNumber: number | null;
  today: string;
  unavailableDates: string[];
  language?: string;
  transcript: Message[];
  trimmed: string;
}): Promise<{ ok: true; reply: CoachReply } | { ok: false; reason: ContinueRefusal }> {
  const {
    athlete,
    conversationId,
    weeklySessionNumber,
    today,
    unavailableDates,
    language,
    transcript,
    trimmed,
  } = params;
  try {
    // A week brought in from the calendar (`/18`) is this conversation's
    // pending proposal; the Coach is told so on every turn, not only the first.
    const staged = await getPendingProposal(athlete.id, conversationId);
    const system = await renderSystem(
      athlete,
      weeklySessionNumber ?? 1,
      today,
      unavailableDates,
      language,
      staged?.sessions ?? null,
    );
    const reply = await callCoach({
      system,
      // The athlete's turn joins the history here rather than being stored
      // first — the same messages the API would have seen either way.
      messages: [...toWeeklyApiMessages(transcript), { role: 'user', content: trimmed }],
      maxTokens: WEEKLY_MAX_TOKENS,
      tools: [PROPOSE_WEEK_PLAN_TOOL],
      toolResult: PROPOSAL_ACK,
    });
    return { ok: true, reply };
  } catch (error) {
    const reason = refusalReason(error);
    logCoachFailure({
      surface: 'weekly_session',
      athleteId: athlete.id,
      conversationId,
      error,
      reason,
    });
    return { ok: false, reason };
  }
}

/**
 * Adds the athlete's turn and the Coach's reply to an owned Weekly Session,
 * persisting both. If the Coach proposes a week (a `propose_week_plan` tool
 * call), the proposal is validated and staged, and returned so the UI can show
 * the confirm/cancel popup. Refuses a conversation that is not this athlete's,
 * and an empty message.
 */
export async function continueWeeklySession(
  athlete: Athlete,
  conversationId: string,
  content: string,
  today: string,
  language?: string,
): Promise<ContinueResult> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  const conversation = await getOwnedConversation(athlete.id, conversationId);
  if (!conversation) return { ok: false, reason: 'not-owner' };

  // Nothing is written until the Coach has answered — the same ordering Coach
  // Chat uses. Persisting the athlete's turn first is the obvious order and the
  // wrong one: the API call is the step that realistically fails, and doing it
  // second leaves a transcript holding a question with no answer, which the
  // athlete cannot retry without their message appearing twice.
  const transcript = await getMessages(conversationId);

  // Read once per turn and threaded from here: the prompt (`renderSystem`)
  // and the planning window (`planningWindowFor`) both need this list, and each
  // fetching it for itself is two round trips for one answer.
  const unavailableDates = await getUnavailableDates(athlete.id);

  const answered = await askCoach({
    athlete,
    unavailableDates,
    conversationId,
    weeklySessionNumber: conversation.weeklySessionNumber,
    today,
    language,
    transcript,
    trimmed,
  });
  if (!answered.ok) return answered;
  const reply = answered.reply;

  // A turn with no words is refused, proposal or not.
  //
  // `callCoach` allows a wordless tool call because the adapter cannot know
  // whether a card will follow; here we do know, and the answer is still no. An
  // earlier version stored the athlete's message alone and let the card speak,
  // which fails twice over: the transcript then holds two consecutive athlete
  // turns (the API expects alternation, and the Coach loses the context that it
  // proposed at all), and a proposal arriving with no explanation is a poor
  // proposal anyway — ADR 0003 has the Coach propose and the athlete decide,
  // which the athlete cannot do well from a bare card.
  //
  // Rare in practice: the adapter already makes a follow-up request precisely to
  // get a closing line, so reaching here means that came back empty too. The
  // athlete resends and normally gets prose. Nothing is written, and no proposal
  // is staged for a turn that was never stored.
  if (reply.text === '') return { ok: false, reason: 'coach-unavailable' };

  const afterBoth = await appendMessages(athlete.id, conversationId, [
    { role: 'athlete', content: trimmed },
    { role: 'coach_ai', content: reply.text },
  ]);
  if (!afterBoth) return { ok: false, reason: 'not-owner' };

  // Validated and staged only once the turn is safely stored — the server is the
  // authority on what is a legal week (ADR 0003), and a proposal recorded
  // against a turn that failed to persist would outlive the conversation it
  // belongs to. An invalid proposal simply isn't staged; the Coach's text still
  // shows and the conversation continues.
  const proposal = await stageProposal(athlete, conversationId, today, unavailableDates, reply);

  return { ok: true, messages: await getMessages(conversationId), proposal };
}

export type CommitResult =
  | { ok: true; sessionCount: number; start: string; end: string }
  | { ok: false; reason: 'not-owner' | 'no-proposal' | 'stale' };

/**
 * Commits the pending proposal — the athlete confirmed. Re-validates against
 * today (a proposal confirmed a day later may have dates now in the past),
 * writes the plan over only the coach-planned days of its own date span, records
 * the confirmation, and ends the session. Nothing an athlete lived through is
 * touched (see {@link replaceCoachPlanForDateRange}).
 */
export async function commitWeeklyPlan(
  athlete: Athlete,
  conversationId: string,
  today: string,
): Promise<CommitResult> {
  const conversation = await getOwnedConversation(athlete.id, conversationId);
  if (!conversation) return { ok: false, reason: 'not-owner' };

  const pending = await getPendingProposal(athlete.id, conversationId);
  if (!pending) return { ok: false, reason: 'no-proposal' };

  // Stale if the proposal no longer fully validates against today — e.g. it was
  // confirmed a day later and a day it included is now in the past. Refuse the
  // whole plan rather than silently commit a shrunken week; the athlete re-plans.
  const window = planningWindowFor(athlete, today, await getUnavailableDates(athlete.id));
  const validated = validateProposedPlan({ sessions: pending.sessions }, window);
  if (!validated.ok || validated.sessions.length !== pending.sessions.length) {
    return { ok: false, reason: 'stale' };
  }

  // The window is the range replaced, not the span the proposal happens to
  // cover. Those differ whenever the Coach plans fewer days than the window
  // holds, and the difference is a Coach session left standing on a day the new
  // week never mentions — a leftover from the plan the athlete just replaced.
  // The window is what they agreed to re-plan, so the window is what clears.
  const { start, end } = window;
  const rows = proposedToNewSessionRows(validated.sessions, athlete.id);
  await replaceCoachPlanForDateRange(athlete.id, start, end, rows);
  await recordPlanCommitted(athlete.id, conversationId, validated.sessions);
  await endConversation(athlete.id, conversationId, new Date());

  return { ok: true, sessionCount: rows.length, start, end };
}

export type DeclineResult =
  | { ok: true }
  | { ok: false; reason: 'not-owner' };

/**
 * Cancels the pending proposal — the athlete chose not to save. The proposal is
 * marked declined and nothing is written; the conversation stays open so the
 * athlete can keep talking or ask for a different week.
 */
export async function declineWeeklyPlan(
  athlete: Athlete,
  conversationId: string,
): Promise<DeclineResult> {
  const conversation = await getOwnedConversation(athlete.id, conversationId);
  if (!conversation) return { ok: false, reason: 'not-owner' };

  const pending = await getPendingProposal(athlete.id, conversationId);
  if (pending) await recordPlanDeclined(athlete.id, conversationId);

  return { ok: true };
}
