import { weekStartOf } from '@/lib/date';

/**
 * The Presence Arc, keyed on data (CONTEXT.md, re-keyed 2026-09-16;
 * `training-architecture/21`).
 *
 * The stage used to be the count of Weekly Sessions held. With the Weekly
 * Session retired as a behavior, it is **what the Coach actually has**: weeks
 * of Session Reflections and Check-ins filed. Counted from data, the Coach
 * speaks as if it knows the athlete exactly when it has something to know, and
 * an athlete who never talks never drifts into false familiarity — there is no
 * clock in here, on purpose.
 *
 * Pure: two counts in, a stage out. The counts come from `presence-repository`.
 *
 * Both thresholds are Mads's first guess, marked provisional: this is the
 * feature that leans hardest on Hyper Intelligence and will need real tuning.
 * Named so a retune is one deliberate edit.
 */

export type PresenceStage = 'cold_start' | 'building' | 'full';

/** Weeks of evidence at which the Coach stops speaking from onboarding alone. */
export const BUILDING_AT = 1;
/** Weeks of evidence at which the Coach may speak with full presence. */
export const FULL_AT = 3;

/**
 * Cold start → building → full, from weeks of Session Reflections and Check-ins
 * filed.
 *
 * The two counts are read as **depth, not total**: a week holding both a
 * reflection and a check-in is one week of knowing the athlete, so the larger
 * count is the evidence, never the sum.
 */
export function presenceStage(reflectionWeeks: number, checkIns: number): PresenceStage {
  const evidenceWeeks = Math.max(reflectionWeeks, checkIns);
  if (evidenceWeeks >= FULL_AT) return 'full';
  if (evidenceWeeks >= BUILDING_AT) return 'building';
  return 'cold_start';
}

/**
 * How many distinct weeks the given rated-session dates fall into. Three
 * ratings in one week are one week of knowing the athlete.
 */
export function reflectionWeeksOf(ratedDates: readonly string[]): number {
  return new Set(ratedDates.map(weekStartOf)).size;
}
