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
 * second copy is exactly the drift this separation exists to avoid.
 */

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
