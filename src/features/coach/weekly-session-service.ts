import type { Athlete } from '@/features/athlete/athlete';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { replaceCoachPlanForDateRange } from '@/features/session/session-repository';
import { planningWindow, type PlanningWindow } from './planning-window';
import { conversationWindow } from './week-draft';
import { getDiscussedWeek } from './week-draft-repository';
import type { ConversationKind } from '@/lib/conversation-kinds';
import { endConversation, getOwnedConversation } from './conversation-repository';
import {
  getPendingProposal,
  recordPlanCommitted,
  recordPlanDeclined,
} from './plan-proposal-repository';
import {
  fixedConstraintsOf,
  proposedToNewSessionRows,
  validateProposedPlan,
} from './weekly-session';

/**
 * The athlete's decision on a proposed week — the server-side half of the
 * Action Proposal card, shared by every conversation that can propose one.
 *
 * Named for the Weekly Session that first owned it. That behavior is retired
 * (ADR 0007, amended 2026-09-16; `training-architecture/21`): nothing starts
 * or continues a `weekly_session` any more, and what remains here is what
 * outlived it — confirming and cancelling a staged proposal. Coach Chat stages
 * proposals in `coach-chat-service`; both land here.
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

/**
 * The window this athlete's plan may be written into, today.
 *
 * Derived here rather than passed in, so a proposal that has drifted out of
 * its window between being staged and being confirmed comes back `stale`
 * rather than being written (`showable-version/11`).
 */
function planningWindowFor(
  athlete: Athlete,
  today: string,
  unavailableDates: string[],
): PlanningWindow {
  return planningWindow(today, fixedConstraintsOf(athlete), unavailableDates);
}

export type CommitResult =
  | { ok: true; sessionCount: number; start: string; end: string }
  | { ok: false; reason: 'not-owner' | 'no-proposal' | 'stale' };

/**
 * The window a confirmed proposal is validated and written against: the
 * conversation's (`training-architecture/20`). For Coach Chat that is the whole
 * of a week brought in to discuss, else this week's remainder; for an old
 * `weekly_session` row (the behavior is retired; nothing creates one) it is
 * this week's remainder, as PR #57 bounded it.
 */
async function windowForCommit(
  athlete: Athlete,
  conversation: { id: string; kind: ConversationKind },
  today: string,
): Promise<PlanningWindow> {
  const unavailableDates = await getUnavailableDates(athlete.id);
  if (conversation.kind !== 'coach_chat') return planningWindowFor(athlete, today, unavailableDates);
  return conversationWindow(
    today,
    await getDiscussedWeek(athlete.id, conversation.id),
    fixedConstraintsOf(athlete),
    unavailableDates,
  );
}

/**
 * Commits the pending proposal — the athlete confirmed. Re-validates against
 * the conversation's window (a proposal confirmed a day later may have dates
 * now in the past), writes the plan over only the coach-planned days of that
 * window, records the confirmation, and ends the conversation if it was one
 * of the retired `weekly_session` kind. Coach Chat is the resting conversation
 * and is never ended. Nothing an
 * athlete lived through is touched (see {@link replaceCoachPlanForDateRange}).
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

  // Stale if the proposal no longer fully validates against the window — e.g.
  // it was confirmed a day later and a day it included is now in the past.
  // Refuse the whole plan rather than silently commit a shrunken week; the
  // athlete re-plans.
  const window = await windowForCommit(athlete, conversation, today);
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
  if (conversation.kind !== 'coach_chat') await endConversation(athlete.id, conversationId, new Date());

  return { ok: true, sessionCount: rows.length, start, end };
}

export type DeclineResult = { ok: true } | { ok: false; reason: 'not-owner' };

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
