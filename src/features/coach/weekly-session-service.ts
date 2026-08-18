import { refusalReason } from '@/lib/identifiers';
import { weekStartOf } from '@/lib/date';
import type { Athlete } from '@/features/athlete/athlete';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import {
  getSessionsForWeek,
  replaceCoachPlanForDateRange,
} from '@/features/session/session-repository';
import { buildWeeklyContext, renderWeeklyPrompt } from './prompts';
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
import {
  buildWeeklyCheckIn,
  proposalDateRange,
  proposedToNewSessionRows,
  skippedFrom,
  toWeeklyApiMessages,
  validateProposedPlan,
  weekFeedbackFrom,
  PROPOSE_WEEK_PLAN_TOOL,
  PROPOSE_WEEK_PLAN_TOOL_NAME,
  WEEKLY_OPENER,
  type ProposedSession,
  type Readiness,
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

// No daily Check-in feature exists yet, so the athlete has never reported a
// readiness — and `null` says exactly that. The prompt then renders a STATE line
// without scores and tells the Coach to ask, which the conversational P1 ("where
// are you physically?") already does. This was a hardcoded 7/7/7/7.5/55 until
// code-health/07: honestly commented, but the prompt presented it to the Coach as
// coaching intelligence, so every athlete read as equally, mildly fine and one
// who said otherwise in words was contradicted by data nobody had gathered.
// Passing a real Readiness here is the one-line change once that data exists.
const NO_CHECK_IN: Readiness | null = null;

const WEEKLY_MAX_TOKENS = 1400;

// What the Coach is told after it proposes a plan: the plan is not saved, the
// athlete decides. This keeps the Coach from claiming the week is done.
const PROPOSAL_ACK =
  'The plan has been shown to the athlete to confirm or cancel. Acknowledge briefly and ' +
  'invite them to confirm when ready. Do not say it has been saved.';


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
  language?: string,
): Promise<string> {
  const weekStart = weekStartOf(today);
  const [weekSessions, equipmentItems] = await Promise.all([
    getSessionsForWeek(athlete.id, weekStart),
    getEquipmentItems(athlete.id),
  ]);
  const checkIn = buildWeeklyCheckIn(
    athlete,
    NO_CHECK_IN,
    weeklySessionNumber,
    language,
    equipmentItems,
  );
  // This slice wires the two inputs it has a real source for: the week's Session
  // Reflections (feedback) and its skips. The remaining ported inputs stay empty
  // because their data sources are later slices, not because they are optional —
  // sessionHistory (Silent Pattern Insight) needs multi-week check-in history,
  // weekActivity needs the events log surfaced, and unavailableDates/fixed
  // constraints are the Unavailable-Dates slice (14). The prompt renders them
  // conditionally, so an empty input simply omits its block.
  const ctx = buildWeeklyContext(
    checkIn,
    weekFeedbackFrom(weekSessions),
    [],
    skippedFrom(weekSessions),
    [],
    null,
    today,
  );
  return renderWeeklyPrompt(ctx);
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
): Promise<StartWeeklySessionResult> {
  const weeklySessionNumber = (await countWeeklySessions(athlete.id)) + 1;

  let reply: CoachReply;
  try {
    // Prompt rendering inside the boundary with the call — it asserts on free
    // text and throws, same as in `continueWeeklySession`.
    const system = await renderSystem(athlete, weeklySessionNumber, today, language);
    reply = await callCoach({
      system,
      messages: [{ role: 'user', content: WEEKLY_OPENER }],
      maxTokens: WEEKLY_MAX_TOKENS,
    });
  } catch (error) {
    return {
      ok: false,
      reason: refusalReason(error),
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

export type ContinueResult =
  | { ok: true; messages: Message[]; proposal: PlanProposal | null }
  | { ok: false; reason: 'not-owner' | 'empty' | 'coach-unavailable' | 'unsafe-content' };

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

  let reply: CoachReply;
  try {
    // `renderSystem` is inside the boundary too, not just the API call: it
    // asserts on athlete free text and throws (`assertNoDirectIdentifier`).
    // Leaving it outside was the exact mistake this branch fixed in Coach Chat.
    const system = await renderSystem(
      athlete,
      conversation.weeklySessionNumber ?? 1,
      today,
      language,
    );
    reply = await callCoach({
      system,
      // The athlete's turn joins the history here rather than being stored
      // first — the same messages the API would have seen either way.
      messages: [...toWeeklyApiMessages(transcript), { role: 'user', content: trimmed }],
      maxTokens: WEEKLY_MAX_TOKENS,
      tools: [PROPOSE_WEEK_PLAN_TOOL],
      toolResult: PROPOSAL_ACK,
    });
  } catch (error) {
    // Refused content and an unreachable Coach are different problems and get
    // different answers, the same split Coach Chat makes: "try again" is useless
    // advice for text that will be refused identically every time.
    return {
      ok: false,
      reason: refusalReason(error),
    };
  }

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
  let proposal: PlanProposal | null = null;
  const call = reply.toolCalls.find((c) => c.name === PROPOSE_WEEK_PLAN_TOOL_NAME);
  if (call) {
    const validated = validateProposedPlan(call.input, today);
    if (validated.ok) {
      await recordProposal(athlete.id, conversationId, validated.sessions);
      proposal = { sessions: validated.sessions };
    }
  }

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
  const validated = validateProposedPlan({ sessions: pending.sessions }, today);
  if (!validated.ok || validated.sessions.length !== pending.sessions.length) {
    return { ok: false, reason: 'stale' };
  }

  const { start, end } = proposalDateRange(validated.sessions);
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
