/**
 * Displacement — the pure rule for what an Unavailable Date does to the sessions
 * on it, and what clearing it undoes. Storage-free and framework-free, like the
 * Move rules it sits beside.
 *
 * Marking a date unavailable is the POC's "a Rest block lands on the day": the
 * day's training is parked in place (`rules.js` `resolveDrop`). Clearing it is
 * the POC's `restoreParkedOn`, guarded so a past day stays history (ADR 0002).
 *
 * This module never moves a session — it only names which sessions flip status
 * in place, and leaves each one on its own day. Placement is the Move rules'
 * authority; because Displacement never changes a session's day, it can never
 * produce a placement the Move rules would refuse.
 */

/** What the park rule reads off a session sitting on a newly-unavailable day. */
export type ParkCandidate = {
  id: string;
  isTraining: boolean;
  status: string;
};

/**
 * The sessions parked when a date becomes unavailable: every *planned* training
 * session on the day. Only a planned session is still-to-happen and so genuinely
 * displaced; a completed or skipped session is already a resolved record and is
 * left untouched — restoring it would rewrite it to `planned` and lose what the
 * athlete recorded, the record mutation ADR 0002 forbids. Non-training sessions
 * (Mobility, Other-as-not-training) coexist with unavailability and stay put.
 *
 * The clean consequence: parking is the single transition planned → unavailable,
 * and restore is its exact inverse, so a park/restore round-trip loses nothing.
 */
export function sessionsToPark(occupants: ParkCandidate[]): string[] {
  return occupants
    .filter((o) => o.isTraining && o.status === 'planned')
    .map((o) => o.id);
}

/** What the restore rule reads off a session when its date is cleared. */
export type RestoreCandidate = {
  id: string;
  parked: boolean;
};

/**
 * The sessions returned to `planned` when an Unavailable Date is cleared — that
 * day's own parked sessions, in place, without the athlete asking. Guarded by
 * the day: clearing a *past* date restores nothing, because the athlete genuinely
 * was unavailable and the training record is immutable (ADR 0002). A current or
 * future date restores freely — the athlete said the day was off and then said
 * it wasn't, so the sessions come back.
 *
 * `date` and `today` are 'YYYY-MM-DD' keys, compared with the same string
 * ordering the Move rules use. "Past" is day-level, not week-level: a day earlier
 * this same week that has already passed is still history.
 */
export function sessionsToRestore(
  occupants: RestoreCandidate[],
  date: string,
  today: string,
): string[] {
  if (date < today) return []; // a day that has passed is history, not a setting
  return occupants.filter((o) => o.parked).map((o) => o.id);
}

/**
 * Whether a date may be newly marked unavailable at all. Nothing is scheduled
 * into the past and the record there is frozen (ADR 0002), so only today and
 * future days are markable. Kept here, pure, so the server and the client's
 * affordance agree on the boundary.
 */
export function canMarkUnavailable(date: string, today: string): boolean {
  return date >= today;
}
