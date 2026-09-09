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

/**
 * Whether clearing an Unavailable Date restores that day's parked sessions.
 *
 * The rule the clear path used to carry inside a row filter, kept here on its
 * own because it never depended on a row: clearing a *past* date restores
 * nothing, because the athlete genuinely was unavailable and the training record
 * is immutable (ADR 0002). A current or future date restores freely - the
 * athlete said the day was off and then said it wasn't, so the sessions come
 * back.
 *
 * `date` and `today` are 'YYYY-MM-DD' keys, compared with the same string
 * ordering the Move rules use. "Past" is day-level, not week-level: a day
 * earlier this same week that has already passed is still history.
 *
 * Its former companions - `sessionsToPark` and `sessionsToRestore` - are gone.
 * Which rows park or restore is now decided by the `WHERE` of a single
 * statement, so that the read-then-write race they sat in the middle of cannot
 * happen; the rules they held are asserted as rendered SQL in
 * `unavailable-date.test.ts`.
 */
export function canRestoreOnClear(date: string, today: string): boolean {
  return date >= today;
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
