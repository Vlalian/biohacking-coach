import { addDays, daysBetween } from '@/lib/date';
import type { BlockPurpose, TrainingBlock } from './training-blocks';

/**
 * The Open Horizon (`training-architecture/13`): Training Blocks for an athlete
 * with no race, **counted forwards** from a start that happened.
 *
 * A race horizon hangs off race day and ends in a taper. This one has no race
 * day, and must never be given one: a synthesised date fed to the backwards
 * arithmetic would taper the athlete into a start line that does not exist.
 * So it is its own shape — a 26-week arc from a stored fact, with its own
 * purposes, none of them a peak or a taper — and it derives to the same
 * `TrainingBlock[]` every reader already consumes.
 *
 * Pure, like `training-blocks.ts`: no clock, no database. Every caller passes
 * `today` and the facts the start is read from.
 */

/** The arc: six months, the lead a race commonly needs (Mads, 2026-09-10). */
const ARC_DAYS = 26 * 7;

/**
 * The arc's blocks, in weeks: three of six, then the remainder — the ticket's
 * `start --6w--12w--18w-->`. Whole weeks, so a block always spans the same
 * weekdays it started on.
 */
const ARC_WEEKS = [6, 6, 6, 8] as const;

/**
 * What each block of the arc is for. Base, build twice, then consolidation —
 * trained as a base block: aerobic, ramping, no bricks. Never `peak`, never
 * `race`: there is nothing to peak for.
 */
const ARC_PURPOSE: readonly BlockPurpose[] = ['base', 'build', 'build', 'base'];
const ARC_NAME = ['Base', 'Build', 'Build 2', 'Consolidate'] as const;

/** Under this many weeks to a race, no race blocks are drawn (the ticket's floor). */
export const MIN_RACE_HORIZON_WEEKS = 8;

/**
 * Whether a race is too close to build blocks toward: from race day back to
 * just under eight weeks. A race already run is not "too close" — it is over.
 *
 * *"A Race entered two weeks out is too late for the Training Blocks and early
 * enough for the week"* (CONTEXT.md): the week adjusts, the blocks do not.
 */
export function isRaceTooClose(today: string, raceDate: string): boolean {
  const days = daysBetween(today, raceDate);
  return days >= 0 && days < MIN_RACE_HORIZON_WEEKS * 7;
}

/**
 * Whether a race is far enough ahead to build Training Blocks toward: eight
 * weeks or more. What decides a race horizon over the Open Horizon.
 */
export function hasRaceHorizon(today: string, raceDate: string): boolean {
  return daysBetween(today, raceDate) >= MIN_RACE_HORIZON_WEEKS * 7;
}

/**
 * Where the arc today stands in begins: the start, or — once an arc has run
 * its 26 weeks — the day after the last completed one.
 *
 * **Cycling is a placeholder** (Mads, 2026-09-10: "use cycle for now"); whether
 * a finished arc cycles or extends is the Head Coach's question (§12b). This is
 * the one function to replace if the answer is "extend".
 */
function nextArcStart(start: string, today: string): string {
  const completedArcs = Math.max(0, Math.floor(daysBetween(start, today) / ARC_DAYS));
  return addDays(start, completedArcs * ARC_DAYS);
}

/** The blocks of the arc today falls in. */
export function openHorizonBlocks(start: string, today: string): TrainingBlock[] {
  let blockStart = nextArcStart(start, today);
  return ARC_WEEKS.map((weeks, i) => {
    const startDate = blockStart;
    const endDate = addDays(startDate, weeks * 7 - 1);
    blockStart = addDays(endDate, 1);
    return {
      index: i + 1,
      total: ARC_WEEKS.length,
      name: ARC_NAME[i],
      startDate,
      endDate,
      authoredBy: 'arithmetic' as const,
      purpose: ARC_PURPOSE[i],
    };
  });
}

/** The stored facts an Open Horizon starts from, all `YYYY-MM-DD`. */
export interface OpenHorizonFacts {
  /** When onboarding finished (`profile.onboardedAt`); absent for anyone onboarded before it was recorded. */
  onboardedAt: string | undefined;
  /** When the athlete row was made — the stand-in when onboarding's own date was never recorded. */
  createdAt: string;
  /** The latest race already run, of every race the athlete has told us of; null when none. */
  lastPassedRaceDate: string | null;
}

/**
 * When the period started (Mads, 2026-09-29): the later of onboarding and the
 * day after the athlete's last passed race. Both are facts that happened, so
 * the arc is pinned — never a guess, and never today, which would slide.
 */
export function openHorizonStart(facts: OpenHorizonFacts): string {
  const onboarded = facts.onboardedAt ?? facts.createdAt;
  const afterRace = facts.lastPassedRaceDate ? addDays(facts.lastPassedRaceDate, 1) : onboarded;
  // Stryker disable next-line EqualityOperator — equivalent: on equal dates both branches return the same date.
  return afterRace > onboarded ? afterRace : onboarded;
}

/** The latest of these race dates before today, or null — the race most recently run. */
export function lastPassedRaceDate(dates: readonly string[], today: string): string | null {
  return dates.filter((d) => d < today).sort().at(-1) ?? null;
}
