/**
 * Whether the Coach should offer the Weekly Session — the single sanctioned
 * proactive nudge (ADR 0007: "Offered every week, forced never").
 *
 * Its own module, framework-free, because the decision is needed on *both*
 * sides: the server knows whether a session has been held this week, and only
 * the browser knows what day it is where the athlete is standing. It used to
 * live in `coach-chat-service`, which imports `callCoach` and is `server-only`,
 * so a client component could not reach it.
 */

/** The half of the nudge decision the server can answer. */
export interface WeeklyOfferInput {
  weeklySessionDay: string | null;
  hasHeldWeeklySessionThisWeek: boolean;
}

/**
 * True only on the athlete's stored Weekly Session Day, and only when they have
 * not already *held* a Weekly Session this week. "Flexible" (or unset) means no
 * preferred day, so no nudge — an athlete who declined to name a day is not
 * asking to be chased; they can still start one whenever they like.
 *
 * The "already done" test is the conversation, not the plan. A week that has a
 * plan is not a week that has been discussed: once generation lands, an
 * auto-drafted week must still be offered, or generation would silence its own
 * offer (coach-overlay issue 04, decision 4).
 *
 * Pure given its inputs: the caller supplies today's weekday and the answer to
 * the "already held" question, so this is decided without a clock or a query.
 */
export function shouldOfferWeeklySession(params: {
  weeklySessionDay: string | null | undefined;
  todayWeekday: string;
  hasHeldWeeklySessionThisWeek: boolean;
}): boolean {
  const { weeklySessionDay, todayWeekday, hasHeldWeeklySessionThisWeek } = params;
  if (!weeklySessionDay || weeklySessionDay === 'Flexible') return false;
  if (weeklySessionDay !== todayWeekday) return false;
  return !hasHeldWeeklySessionThisWeek;
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
