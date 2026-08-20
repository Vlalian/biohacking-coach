import { weekStartOf } from '@/lib/date';

/**
 * The instrumentation an unattended test needs (`showable-version/05`, item 1).
 *
 * Pure: rows in, numbers out. There is no UI and deliberately no dashboard —
 * this exists to be read off a terminal by the person running the test, and a
 * dashboard is a different project (ADR 0004's no-dashboards ruling is about
 * the Roster, but the spirit carries).
 *
 * Every figure is keyed to the athlete's **opaque id** and nothing else. A name
 * or an email in a metrics row would put identity somewhere identity is
 * deliberately kept out of (ADR 0006).
 */

/** One session, reduced to what any of these metrics actually needs. */
export interface MetricSession {
  date: string;
  status: string;
  rated: boolean;
}

export interface MetricsInput {
  athleteId: string;
  sessions: MetricSession[];
  /** Week-start keys in which the athlete sent at least one Coach Chat turn. */
  chatTurnWeeks: string[];
  /** Week-start keys in which the athlete declined a Week Plan proposal. */
  planDeclinedWeeks: string[];
  /** Week-start keys in which the athlete took a turn in a Weekly Session. */
  weeklySessionTurnWeeks: string[];
  /** Every day the athlete did something the app recorded. */
  activityDays: string[];
  /** The date of each `session_moved` event. */
  moveEventDates: string[];
}

/** A count over a total, with the ratio — null when the total is zero. */
export interface Ratio {
  rate: number | null;
}

export interface AthleteMetrics {
  athleteId: string;
  coachEngagement: { engagedWeeks: number; activeWeeks: number; rate: number | null };
  retention: { spanDays: number; pastDay10: boolean };
  reflectionCompletion: { rated: number; completed: number; rate: number | null };
  skips: { skipped: number; decided: number; rate: number | null };
  movesPerWeek: number | null;
}

/** A ratio, or null when there is nothing to divide by — never a fake zero. */
function ratioOf(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Coach Engagement Rate — the product's primary engagement health metric.
 *
 * `CONTEXT.md`: *the ratio of active training weeks where the athlete initiated
 * at least one meaningful Coach interaction **beyond** the mandatory Weekly
 * Session.* Both halves of that sentence do work:
 *
 * - **"beyond the mandatory Weekly Session"** — holding the weekly ritual is
 *   compliance, not engagement, so a week whose only Coach contact was a
 *   Weekly Session the athlete simply agreed to counts for nothing. Getting
 *   this wrong is what would make the metric meaningless, so it has its own
 *   test.
 * - **"active training weeks"** — the denominator is weeks the athlete actually
 *   trained in, not calendar weeks since signup. A quiet fortnight does not
 *   dilute the rate; it simply is not counted.
 *
 * The glossary's third arm — "a Session Negotiation triggered by a plan
 * deviation" — needs no separate term here: Session Negotiation stopped being
 * its own conversation kind (CONTEXT.md, decided 2026-08-12) and is now a
 * message in Coach Chat carrying the Session as a Reference, so it is already
 * inside the Coach Chat arm.
 *
 * **"An extended discussion within the Weekly Session" is measured as declining
 * a proposal, not by counting turns** (Mads, 2026-08-21). The Weekly Session
 * runs until the athlete presses yes, so turn count measures how long agreeing
 * took — a thorough athlete would score as engaged for being thorough, which is
 * the ritual working, not engagement. Cancelling the Coach's proposed week and
 * carrying on is the athlete refusing to just accept what they were handed, and
 * `week_plan_declined` already records it. No threshold, and nothing to tune.
 */
function coachEngagement(input: MetricsInput) {
  const activeWeeks = new Set(
    input.sessions
      .filter((s) => s.status === 'completed' || s.status === 'skipped')
      .map((s) => weekStartOf(s.date)),
  );

  const engaged = new Set(
    [...input.chatTurnWeeks, ...input.planDeclinedWeeks].filter((week) =>
      activeWeeks.has(week),
    ),
  );

  return {
    engagedWeeks: engaged.size,
    activeWeeks: activeWeeks.size,
    rate: ratioOf(engaged.size, activeWeeks.size),
  };
}

/**
 * Retention past day 10 — the habit-formation window (Fogg/Clear, per
 * `CONTEXT.md`). Measured as the span between the athlete's first and last
 * recorded activity, so it answers "did the ritual take hold" rather than "are
 * they still subscribed".
 */
function retention(activityDays: string[]) {
  if (activityDays.length === 0) return { spanDays: 0, pastDay10: false };

  const times = activityDays.map((d) => Date.parse(`${d}T00:00:00Z`)).sort((a, b) => a - b);
  const spanDays = Math.round((times[times.length - 1] - times[0]) / DAY_MS);
  return { spanDays, pastDay10: spanDays > 10 };
}

/** Every figure for one athlete, in the order the report prints them. */
export function athleteMetrics(input: MetricsInput): AthleteMetrics {
  const completed = input.sessions.filter((s) => s.status === 'completed');
  const rated = completed.filter((s) => s.rated);
  // Skips are measured against the sessions reality has decided — a planned
  // session that has not happened yet is not evidence of anything.
  const decided = input.sessions.filter(
    (s) => s.status === 'completed' || s.status === 'skipped',
  );
  const skipped = decided.filter((s) => s.status === 'skipped');

  const engagement = coachEngagement(input);

  return {
    athleteId: input.athleteId,
    coachEngagement: engagement,
    retention: retention(input.activityDays),
    reflectionCompletion: {
      rated: rated.length,
      completed: completed.length,
      rate: ratioOf(rated.length, completed.length),
    },
    skips: {
      skipped: skipped.length,
      decided: decided.length,
      rate: ratioOf(skipped.length, decided.length),
    },
    movesPerWeek: ratioOf(input.moveEventDates.length, engagement.activeWeeks),
  };
}
