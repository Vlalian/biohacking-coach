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
   * The days inside `[start, end]` the athlete has ruled out — a Fixed
   * Constraint's weekday and an Unavailable Date, both already resolved to
   * concrete date keys and sorted.
   *
   * Resolved here so nothing downstream has to know that one is a weekday name
   * and the other a day, and carried at all because the window used to consume
   * these to pick a range and then drop them — leaving `validateProposedPlan`
   * accepting any real date inside it. The `NO TRAINING ON:` prompt line was
   * the only thing keeping the Coach off those days, and `showable-version/11`
   * is the ticket that established a prompt line is a request rather than a
   * bound. Found by CodeRabbit on PR #57, 2026-09-09.
   */
  excludedDates: string[];
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
    return {
      start: today,
      end: endOfThisWeek,
      excludedDates: excludedBetween(today, endOfThisWeek, fixedConstraints, unavailableDates),
      fellThrough: false,
    };
  }

  const nextWeekStart = addDays(weekStartOf(today), 7);
  const nextWeekEnd = addDays(nextWeekStart, 6);
  return {
    start: nextWeekStart,
    end: nextWeekEnd,
    // Next week's exclusions, not the week that was given up on — a caller
    // refusing days against the wrong week's list is worse than no list.
    excludedDates: excludedBetween(nextWeekStart, nextWeekEnd, fixedConstraints, unavailableDates),
    fellThrough: true,
  };
}

/**
 * The days in `[from, to]` the athlete has ruled out, ascending.
 *
 * The exact inverse of {@link hasAPlannableDay}'s test, walked over the whole
 * range instead of stopping at the first day that survives. A day is listed
 * once however many ways it is ruled out.
 */
function excludedBetween(
  from: string,
  to: string,
  fixedConstraints: string[],
  unavailableDates: string[],
): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (unavailableDates.includes(day) || fixedConstraints.includes(weekdayName(day))) {
      out.push(day);
    }
  }
  return out;
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
