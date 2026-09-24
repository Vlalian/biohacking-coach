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
 * `firstDay` is the athlete's own start, asked at the end of onboarding
 * (`training-architecture/36`). It moves the opening of the window and nothing
 * else: the no-day-count floor stands, and so does the fall-through. Mads ruled
 * on 2026-09-23 that no session lands before that day *from anyone*. A day
 * already past is spent and changes nothing, which is what makes it safe to
 * keep reading an answer given months ago.
 *
 * It is a parameter rather than a read, because this function is pure and the
 * profile is not. Every caller that writes must pass it: `commitWeeklyPlan`
 * and `conversationWindow` do, through `chosenFirstDay`. {@link wholeWeekWindow}
 * is the one write path it does not reach — a week brought in to discuss is
 * written whole, as drafted (Mads, 2026-09-15), and reconciling that with the
 * 2026-09-23 ruling is a decision neither ticket settles.
 *
 * Pure, and it constrains the write rather than only instructing the model,
 * which is the correction this ticket exists for. A prompt line is an
 * instruction; this is a bound.
 */
export function planningWindow(
  today: string,
  fixedConstraints: string[] = [],
  unavailableDates: string[] = [],
  firstDay?: string,
): PlanningWindow {
  const start = notBefore(today, firstDay);
  const endOfThisWeek = addDays(weekStartOf(start), 6);

  if (hasAPlannableDay(start, endOfThisWeek, fixedConstraints, unavailableDates)) {
    return {
      start,
      end: endOfThisWeek,
      excludedDates: excludedBetween(start, endOfThisWeek, fixedConstraints, unavailableDates),
      fellThrough: false,
    };
  }

  const nextWeekStart = addDays(weekStartOf(start), 7);
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
 * `day`, unless `floor` is later — the one comparison behind every "no session
 * before this" bound in the planner.
 *
 * Written once because it is the rule, not an inequality: {@link planningWindow}
 * and `weekWindow` both push a window's opening forward to the athlete's chosen
 * first day, and a second copy is a second place for it to drift. An absent or
 * already-past floor leaves `day` exactly as it was, which is what keeps every
 * caller that passes nothing behaving as it did before `training-architecture/36`.
 */
export function notBefore(day: string, floor: string | undefined): string {
  // Stryker disable next-line EqualityOperator — `>` and `>=` differ only when the two are equal, and then both branches are that same day.
  return floor && floor > day ? floor : day;
}

/**
 * The days in `[from, to]` the athlete has ruled out, ascending.
 *
 * The exact inverse of {@link hasAPlannableDay}'s test, walked over the whole
 * range instead of stopping at the first day that survives. A day is listed
 * once however many ways it is ruled out.
 */
export function excludedBetween(
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
export function hasAPlannableDay(
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
