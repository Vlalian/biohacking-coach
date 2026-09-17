import type { UiPlanProposal } from './plan-proposal-card';

/**
 * What the Action Proposal card is showing, and what the last decision left to
 * tell the athlete. Pure: the decisions live here so they can be pinned by
 * tests; `use-plan-decision.ts` is the React plumbing that applies them
 * (`training-architecture/20`, on the review's finding that the Weekly Session
 * and Coach Chat each carried a copy).
 */
export interface PlanDecisionState {
  proposal: UiPlanProposal | null;
  /** Whether the popup is up; false drops to the persistent bar. */
  popupOpen: boolean;
  notice: DecisionNotice;
}

export type DecisionNotice =
  | { kind: 'none' }
  | { kind: 'planned'; count: number }
  | { kind: 'stale' }
  | { kind: 'error' };

/** Nothing on the table. A fresh conversation starts here. */
export const IDLE_DECISION: PlanDecisionState = { proposal: null, popupOpen: false, notice: { kind: 'none' } };

/** The state a conversation restores into: its pending proposal, popup up, or idle. */
export function restoredDecision(initial: UiPlanProposal | null | undefined): PlanDecisionState {
  return initial ? { proposal: initial, popupOpen: true, notice: { kind: 'none' } } : IDLE_DECISION;
}

/**
 * A turn came back. A fresh proposal supersedes any earlier one and reopens the
 * popup; a turn with none leaves a pending one exactly as it was.
 */
export function received(state: PlanDecisionState, next: UiPlanProposal | null | undefined): PlanDecisionState {
  return next ? { proposal: next, popupOpen: true, notice: { kind: 'none' } } : state;
}

/**
 * The athlete confirmed. Written: the card goes and the athlete is told how
 * much landed. Stale: the plan crossed into a new day — keep it visible so the
 * athlete can cancel and ask for a fresh one, rather than committing a shrunken
 * week. Anything else is an error the card stays up for.
 */
export function committed(
  state: PlanDecisionState,
  result: { ok: true; sessionCount: number } | { ok: false; reason: string },
): PlanDecisionState {
  if (result.ok) return { proposal: null, popupOpen: false, notice: { kind: 'planned', count: result.sessionCount } };
  if (result.reason === 'stale') return { ...state, popupOpen: false, notice: { kind: 'stale' } };
  return { ...state, notice: { kind: 'error' } };
}

/** The athlete cancelled. Nothing written; the card goes, or stays on an error. */
export function cancelled(state: PlanDecisionState, result: { ok: boolean }): PlanDecisionState {
  return result.ok ? IDLE_DECISION : { ...state, notice: { kind: 'error' } };
}
