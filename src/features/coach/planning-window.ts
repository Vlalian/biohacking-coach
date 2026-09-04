import { addDays, weekStartOf } from '@/lib/date';

/**
 * The range a Week Plan may cover, and whether it had to give up on this week.
 *
 * `start` and `end` are inclusive 'YYYY-MM-DD' keys, in the same shape and the
 * same string ordering the Move rules and `sessions.date` use.
 */
export interface PlanningWindow {
  start: string;
  end: string;
  /**
   * True when the current week held no plannable day and the window fell
   * through to the whole of next week.
   *
   * The only circumstance in which a new athlete sees an empty current week,
   * and it must never be silent: when this is set, the Coach says when training
   * starts (`showable-version/11`, decided 2026-09-02).
   */
  fellThrough: boolean;
}

/**
 * The window a plan may be written into: the remainder of this week, always.
 *
 * A newly-onboarded athlete gets the rest of their current week with **no
 * day-count floor** — a three-day floor was offered and declined on 2026-09-02,
 * because an athlete onboarding on Saturday evening is better served by a
 * one-session week than by an unexplained empty one.
 *
 * The one exception is a boundary rather than a threshold: when nothing of the
 * current week is plannable, there is no remainder to plan, and the window falls
 * through to the next full week with {@link PlanningWindow.fellThrough} set.
 *
 * Pure, and deliberately the *only* place this rule lives. The Weekly Session's
 * `commitWeeklyPlan` and automatic generation both derive their write range from
 * here, so it is one rule and not two — and it constrains the write rather than
 * only instructing the model, which is the correction this ticket exists for.
 * A prompt line is an instruction; this is a bound.
 */
export function planningWindow(
  today: string,
  fixedConstraints: string[] = [],
  unavailableDates: string[] = [],
): PlanningWindow {
  const endOfThisWeek = addDays(weekStartOf(today), 6);

  if (hasAPlannableDay(today, endOfThisWeek, fixedConstraints, unavailableDates)) {
    return { start: today, end: endOfThisWeek, fellThrough: false };
  }

  const nextWeekStart = addDays(weekStartOf(today), 7);
  return {
    start: nextWeekStart,
    end: addDays(nextWeekStart, 6),
    fellThrough: true,
  };
}

/**
 * Whether any day in `[from, to]` could hold training.
 *
 * A day is unplannable when the athlete's Fixed Constraints name its weekday, or
 * when it is an Unavailable Date. The two are different shapes — a weekday name
 * against a date key — and are deliberately compared differently rather than
 * normalised into one list, because they mean different things: a Fixed
 * Constraint is a standing rule, an Unavailable Date is one day the athlete said
 * was off.
 *
 * Note this asks only whether a *remainder exists*, not which days are free —
 * placing sessions around the no-training days stays the Coach's job, told to it
 * by the `NO TRAINING ON:` line. Conflating the two would put the window in the
 * business of composing the week.
 */
function hasAPlannableDay(
  from: string,
  to: string,
  fixedConstraints: string[],
  unavailableDates: string[],
): boolean {
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (unavailableDates.includes(day)) continue;
    if (fixedConstraints.includes(weekdayName(day))) continue;
    return true;
  }
  return false;
}

/**
 * The English weekday name of a date key — 'Monday', 'Sunday', …
 *
 * English and capitalised because that is the shape Fixed Constraints are stored
 * in: `ONBOARDING_OPTIONS.days` writes them, and `addFixedConstraint` compares
 * them as literal strings inside SQL. This is a key, not display text; the
 * athlete's own language never reaches it.
 */
function weekdayName(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
}
