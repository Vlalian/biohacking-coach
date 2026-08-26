/**
 * The Session status transitions, as plain data in and plain data out.
 *
 * Framework-free: the adapter (`session-status.ts`) owns the reads and writes
 * and asks these functions what the next status is and what to record. Keeping
 * the decision here means the toggle semantics are tested without a database,
 * and the adapter is left with nothing but I/O.
 *
 * The freeze rule is deliberately NOT duplicated here — `isFrozen` in
 * `move-rules.ts` is already the one pure statement of it (ADR 0002), and a
 * second copy is exactly the drift this separation exists to avoid. It is
 * imported instead, for the same reason.
 */

import { isFrozen, type MoveCandidate } from './move-rules';

export type SessionStatusTransition = {
  /** The status to write. */
  next: string;
  /** Whether `parked` should be set — it mirrors `status` so the calendar's
   *  dashed-dot affordance and Session Move's "a parked session doesn't drag"
   *  rule both read one flag. */
  parked: boolean;
  /** The event to append, so the move log records what actually happened. */
  event: string;
};

/**
 * Skipped ↔ Planned. A skip needs no explanation (US-3) — context is gathered
 * at the next Weekly Session, not in the moment.
 */
export function skipTransition(currentStatus: string): SessionStatusTransition {
  const next = currentStatus === 'skipped' ? 'planned' : 'skipped';
  return {
    next,
    parked: false,
    event: next === 'skipped' ? 'session_skipped' : 'session_skip_undone',
  };
}

/**
 * Unavailable ↔ Planned — the session-level Unavailable state (distinct from an
 * Unavailable *Date*). "Unavailable declares 'can't happen as placed'", so the
 * session is parked in place rather than abandoned (CONTEXT.md, Unavailable).
 */
export function unavailableTransition(currentStatus: string): SessionStatusTransition {
  const makingUnavailable = currentStatus !== 'unavailable';
  return {
    next: makingUnavailable ? 'unavailable' : 'planned',
    parked: makingUnavailable,
    event: makingUnavailable ? 'session_marked_unavailable' : 'session_unavailable_undone',
  };
}

/**
 * Completing is one-directional: there is no undo-complete control, matching
 * the Session Drawer (a completed session offers Skip and Unavailable, never a
 * way back to planned).
 */
export function completeTransition(): SessionStatusTransition {
  return { next: 'completed', parked: false, event: 'session_completed' };
}

/** Nothing in the future is "done" yet. */
export function isFutureDated(date: string, today: string): boolean {
  return date > today;
}

/** Which status actions the Session Drawer may offer on a session. */
export type OfferedStatusActions = {
  complete: boolean;
  skip: boolean;
  unavailable: boolean;
};

/**
 * The three status actions a session offers, decided once and in one place.
 *
 * The drawer used to reason about this inline, and got Mark complete wrong: it
 * gated only on `status !== 'completed'`, so a future-dated session — which is
 * every session the Weekly Session writes — showed a primary action that
 * `completeSession` was always going to refuse. The athlete pressed it and
 * nothing happened.
 *
 * The server stays the authority (ADR 0006): this decides what to *offer*,
 * never what to permit, and it deliberately mirrors the refusals in
 * `session-status.ts` rather than inventing its own. A frozen session offers
 * nothing; a future one can still be skipped or marked unavailable, because
 * "hasn't happened yet" is not "untouchable".
 */
export function offeredStatusActions(
  session: MoveCandidate,
  today: string,
): OfferedStatusActions {
  const frozen = isFrozen(session, today);

  return {
    complete: !frozen && !isFutureDated(session.date, today),
    skip: !frozen,
    unavailable: !frozen,
  };
}
