import type { RaceRow } from '@/db/schema';
import { addDays } from '@/lib/date';

/**
 * What the athlete's Races mean for the plan (`training-architecture/09`).
 *
 * The repository says which Races exist and which one is the Target Race. This
 * module says what the others are *for*: a **Tune-up Race** is a non-target Race
 * before the target, treated as an ordinary training day that happens to carry a
 * Race Distance (*Distancens Arkitektur* §04); a race entered *after* the week
 * was planned is the "middle case" — too late for the Training Blocks, early
 * enough for the week, and the Coach must say so rather than imply otherwise.
 *
 * Pure, and modelled on `training-blocks.ts` for the same reason: no clock, no
 * database. Every caller passes `today`.
 */

/** The Head Coach interview's open question, built as an option with the value left to them.
 *
 * §04 warns that tapering for a tune-up is how athletes peak too early, and a
 * race is still a maximal effort the athlete will actually race. Whether the day
 * before should be easy is coaching judgment the recruited Head Coach owns; the
 * ticket says build the option and leave the value. Off means "ordinary training
 * day" — the glossary's stated rule.
 */
export const TUNE_UP_EVE_EASY = false;

/**
 * The non-target Races between today and the Target Race, earliest first.
 *
 * Empty with no target on purpose: a Race with nothing to tune up *for* is just a
 * race, and calling it a tune-up would tell the Coach a story about the plan
 * that nobody wrote.
 */
export function tuneUpRaces(
  today: string,
  races: readonly RaceRow[],
  target: Pick<RaceRow, 'id' | 'date'> | null,
): RaceRow[] {
  if (!target) return [];
  // No id check: the target is excluded by `date < target.date`, and a second
  // race on race day is not a tune-up for it either.
  return races
    .filter((r) => r.date > today && r.date < target.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Races entered after the current week's plan was written — the middle case.
 *
 * Compares instants, not days: a race entered at 09:00 on the morning the plan
 * was written at 08:00 is late for it. The target is excluded because a new
 * Target Race re-derives the Training Blocks, so it is never "late" in the sense
 * this function reports. Nothing is late when no plan has been written.
 */
export function racesEnteredAfterPlan(
  races: readonly RaceRow[],
  target: Pick<RaceRow, 'id'> | null,
  planWrittenAt: Date | null,
): RaceRow[] {
  if (!planWrittenAt) return [];
  const targetId = target ? target.id : null;
  return races.filter(
    (r) => r.id !== targetId && r.createdAt.getTime() > planWrittenAt.getTime(),
  );
}

/** Inclusive date keys, `YYYY-MM-DD`. */
export interface TuneUpWindow {
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_WINDOW_WEEKS = 12;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

/**
 * Where a Tune-up Race would sit: 30–60 % of the way from `horizonStart` to race
 * day (§04: *"placeret 30–60 % inde i opbygningen"*).
 *
 * `horizonStart` is when the athlete entered the race — a date that happened —
 * rather than today. Measured from today the window would slide forward every
 * week and never close, which is the nag this exists to prevent. The first
 * Training Block also starts at today (slice 03), so it is not a stable anchor
 * either; ticket 13 owns that. Null under twelve weeks: too short a build to
 * hold a rehearsal that is not the race itself.
 */
export function tuneUpWindow(horizonStart: string, raceDate: string): TuneUpWindow | null {
  const days = daysBetween(horizonStart, raceDate);
  if (days < MIN_WINDOW_WEEKS * 7) return null;
  return {
    from: addDays(horizonStart, Math.round(days * 0.3)),
    to: addDays(horizonStart, Math.round(days * 0.6)),
  };
}

/**
 * Whether today falls inside the window — the only weeks the prompt carries the
 * line, so the Coach can only raise a tune-up while entering one still makes
 * sense (Mads, 2026-09-11: option b — self-limiting by construction, no state).
 */
export function inTuneUpWindow(today: string, window: TuneUpWindow | null): boolean {
  if (!window) return false;
  return today >= window.from && today <= window.to;
}
