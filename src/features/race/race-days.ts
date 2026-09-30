/**
 * Which calendar days carry a race, and what kind (`training-architecture/37`).
 *
 * A race day is a day block in the Training Plan calendar, not a Session Chip
 * (ruling 2). The kind is **derived, never stored**: the Target Race is the one
 * flagged, a Tune-up Race is a non-target race before it (`races.ts`,
 * CONTEXT.md), and anything else — a race after the target, or any race when
 * there is no target — is simply a race. Pure: no clock, no database.
 */

export type RaceKind = 'target' | 'tune-up' | 'other';

/** A Race as the calendar needs it: no id, no athlete. */
export interface CalendarRace {
  /** `YYYY-MM-DD`. */
  date: string;
  name: string;
  distance: string;
  isTarget: boolean;
}

export interface RaceDay extends CalendarRace {
  kind: RaceKind;
}

function kindOf(race: CalendarRace, targetDate: string | undefined): RaceKind {
  if (race.isTarget) return 'target';
  // No target is `''`, which no date key sorts before: nothing is a tune-up.
  return race.date < (targetDate ?? '') ? 'tune-up' : 'other';
}

/** The races by date key, each with its kind, in the order given. */
export function raceDaysByDate(races: readonly CalendarRace[]): Map<string, RaceDay[]> {
  const targetDate = races.find((r) => r.isTarget)?.date;
  const byDate = new Map<string, RaceDay[]>();
  for (const race of races) {
    const day = { ...race, kind: kindOf(race, targetDate) };
    byDate.set(race.date, [...(byDate.get(race.date) ?? []), day]);
  }
  return byDate;
}
