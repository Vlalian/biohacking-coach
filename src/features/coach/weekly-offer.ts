/**
 * Whether the Coach should ask for a Check-in today — the single sanctioned
 * proactive nudge (ADR 0007: "Offered every week, forced never"), repurposed
 * when the Weekly Session was retired (amendment 2026-09-16;
 * `training-architecture/21`): the reminder now opens the Check-in, scheduled
 * on the Weekly Session Day before the week is drafted, never forced.
 *
 * Its own module, framework-free, because the decision is needed on *both*
 * sides: the server knows whether a session has been held this week, and only
 * the browser knows what day it is where the athlete is standing. It used to
 * live in `coach-chat-service`, which imports `callCoach` and is `server-only`,
 * so a client component could not reach it.
 */

/** The seven weekdays, Sunday first — the order `Date.getUTCDay()` counts in. One home; `week-draft.ts` indexes into it. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The day the athlete's week turns on. A stored "Flexible" (retired
 * 2026-09-14) or nothing at all reads as Sunday — the week is drafted before it
 * starts — until the athlete or their Head Coach picks a day. One reading of
 * the column, shared by the nudge, the draft and the prompt, so the three can
 * never disagree about which day it is.
 */
export function effectiveWeeklySessionDay(value: string | null | undefined): string {
  return value && WEEKDAYS.includes(value) ? value : 'Sunday';
}

/** The half of the nudge decision the server can answer. */
export interface CheckInOfferInput {
  weeklySessionDay: string | null;
  /** Whether a Check-in is already filed for the week containing today. */
  hasCheckedInThisWeek: boolean;
}

/**
 * True only on the athlete's stored Weekly Session Day, and only when they have
 * not already filed this week's Check-in. Skipping the reminder changes
 * nothing — it is asked again on the next Weekly Session Day, and a Check-in
 * filed late is simply the freshest signal for whatever prompt reads it next.
 *
 * The "already done" test is the Check-in itself, not the plan: a drafted week
 * is not a week the athlete has reported on, so the draft landing must not
 * silence the reminder (the same reasoning as coach-overlay issue 04, decision
 * 4, for the offer this replaced).
 *
 * Pure given its inputs: the caller supplies today's weekday and the answer to
 * the "already filed" question, so this is decided without a clock or a query.
 */
export function shouldOfferCheckIn(params: {
  weeklySessionDay: string | null | undefined;
  todayWeekday: string;
  hasCheckedInThisWeek: boolean;
}): boolean {
  const { weeklySessionDay, todayWeekday, hasCheckedInThisWeek } = params;
  // "Flexible" is retired and an unset day reads as Sunday (CONTEXT.md,
  // 2026-09-14): every athlete has a day, so every athlete gets the reminder.
  if (effectiveWeeklySessionDay(weeklySessionDay) !== todayWeekday) return false;
  return !hasCheckedInThisWeek;
}

/**
 * Today's weekday where the athlete actually is.
 *
 * `en-US` long names on purpose: that is the vocabulary the Athlete Profile
 * stores its Weekly Session Day in, so this compares like with like regardless
 * of the athlete's display language.
 *
 * Called in the browser, deliberately. Resolved on the server it would be the
 * *server's* weekday — and with no timezone stored on the profile, a nudge
 * decided at 23:30 in Copenhagen would be reading a UTC clock that has already
 * rolled over to tomorrow, offering the session a day late or a day early.
 */
export function localWeekday(now: Date): string {
  return now.toLocaleDateString('en-US', { weekday: 'long' });
}
