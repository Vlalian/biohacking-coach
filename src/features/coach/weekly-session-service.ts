import type Anthropic from '@anthropic-ai/sdk';
import { weekStartOf } from '@/lib/date';
import type { Athlete } from '@/features/athlete/athlete';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import {
  getSessionsForWeek,
  replaceCoachPlanForDateRange,
} from '@/features/session/session-repository';
import { buildWeeklyContext, renderWeeklyPrompt } from './prompts';
import { callCoach } from './coach-client';
import {
  appendMessages,
  countWeeklySessions,
  createConversation,
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
  toApiMessages,
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

// Until a daily Check-in feature exists, the numeric STATE the prompt carries is
// a neutral baseline — the conversational P1 ("where are you physically?")
// gathers the athlete's real state in words. Swapping this for real readiness is
// a one-line change once that data exists.
const BASELINE_READINESS: Readiness = {
  body: 7,
  mental: 7,
  energy: 7,
  sleep: 7.5,
  pulse: 55,
};

const WEEKLY_MAX_TOKENS = 1400;

// What the Coach is told after it proposes a plan: the plan is not saved, the
// athlete decides. This keeps the Coach from claiming the week is done.
const PROPOSAL_ACK =
  'The plan has been shown to the athlete to confirm or cancel. Acknowledge briefly and ' +
  'invite them to confirm when ready. Do not say it has been saved.';

const PLAN_TOOL = PROPOSE_WEEK_PLAN_TOOL as unknown as Anthropic.Tool;

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
    BASELINE_READINESS,
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

/** Opens a new Weekly Session: the Coach speaks first, and it is persisted. */
export async function startWeeklySession(
  athlete: Athlete,
  today: string,
  language?: string,
): Promise<WeeklySessionState> {
  const weeklySessionNumber = (await countWeeklySessions(athlete.id)) + 1;
  const conversation = await createConversation({
    athleteId: athlete.id,
    kind: 'weekly_session',
    weeklySessionNumber,
  });

  const system = await renderSystem(athlete, weeklySessionNumber, today, language);
  const reply = await callCoach({
    system,
    messages: [{ role: 'user', content: WEEKLY_OPENER }],
    maxTokens: WEEKLY_MAX_TOKENS,
  });
  const messages =
    (await appendMessages(athlete.id, conversation.id, [
      { role: 'coach_ai', content: reply.text },
    ])) ?? [];

  return {
    conversationId: conversation.id,
    weeklySessionNumber,
    messages,
    proposal: null,
    endedAt: null,
  };
}

export type ContinueResult =
  | { ok: true; messages: Message[]; proposal: PlanProposal | null }
  | { ok: false; reason: 'not-owner' | 'empty' };

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

  const afterAthlete = await appendMessages(athlete.id, conversationId, [
    { role: 'athlete', content: trimmed },
  ]);
  if (!afterAthlete) return { ok: false, reason: 'not-owner' };

  const transcript = await getMessages(conversationId);
  const system = await renderSystem(athlete, conversation.weeklySessionNumber ?? 1, today, language);
  const reply = await callCoach({
    system,
    messages: toApiMessages(transcript),
    maxTokens: WEEKLY_MAX_TOKENS,
    tools: [PLAN_TOOL],
    toolResult: PROPOSAL_ACK,
  });

  await appendMessages(athlete.id, conversationId, [{ role: 'coach_ai', content: reply.text }]);

  // If the Coach proposed a week, validate it (the server is the authority) and
  // stage it for the athlete to confirm. An invalid proposal simply isn't staged
  // — the Coach's text still shows and the conversation continues.
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
