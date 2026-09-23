import type { PlanningWindow } from './planning-window';
import { weekSkeleton, wholeWeekWindow, type SkeletonDay } from './week-draft';
import { addDays, weekStartOf } from '@/lib/date';
import { blockPurpose, type BlockPurpose, type TrainingBlock } from './training-blocks';
import type { PlanType, ProposedSession } from './weekly-session';

/**
 * The arithmetic that fills a week with real sessions
 * (`training-architecture/34`).
 *
 * Stage 1 of the same ladder `training-blocks.ts` sits on: the structure draws
 * the weeks, the Coach adjusts them week by week, a Head Coach overrides. The
 * athlete friend's complaint on 2026-09-19 was that the calendar is empty
 * beyond this week — a plan you cannot see is not a plan. So every week of the
 * current block gets rows the moment there are hours and a race to work from.
 *
 * Pure, like the blocks: hours, a window and a purpose in; rows out. No clock,
 * no database, no Coach call. The weekly rhythm is **not** restated here —
 * `weekSkeleton` owns which day is long, which is hard and which are easy
 * (*Distancens Arkitektur* §05), and this module only decides what goes on
 * those days.
 *
 * Every number below is a decision recorded in the 34 plan (D2–D10), written
 * as a named constant so changing one is one edit and one assertion.
 */

/** A session the arithmetic wrote: a proposal plus the discipline and the human label. */
export interface ArithmeticSession extends ProposedSession {
  sport: 'swim' | 'bike' | 'run' | 'brick';
  title: string;
}

/** The median session in the corpus is about 90 minutes (§03). */
const MINUTES_PER_SESSION = 90;
const MIN_SESSIONS = 3;
const MAX_SESSIONS = 7;

/**
 * How many sessions the athlete's hours buy (D2). Never fewer than three — a
 * week with less is not a training week — and never more than seven, because
 * a day holds one.
 */
export function sessionsPerWeek(hours: number): number {
  const fromHours = Math.ceil((hours * 60) / MINUTES_PER_SESSION);
  return Math.min(Math.max(fromHours, MIN_SESSIONS), MAX_SESSIONS);
}

/** The wave inside a block: ramp to full, then deload before the phase changes (D5). */
const RAMP_FROM = 0.85;
const DELOAD = 0.6;
/** The two weeks before race day (D4). */
const TAPER_NEAR = 0.35;
const TAPER_FAR = 0.6;
const TAPER_FAR_DAYS = 13;
const TAPER_NEAR_DAYS = 6;
/** A block needs three weeks before a deload week is worth spending (D5). */
const MIN_WEEKS_FOR_WAVE = 3;

/**
 * What fraction of the athlete's hours a week carries.
 *
 * Three rules, in order. The **taper** wins over everything: the last two weeks
 * before race day drop to 60 % then 35 %, whatever block they fall in (D4).
 * Otherwise the last week of a block of three or more is a **deload** at 60 %,
 * so the phase change lands on fresh legs (§11). Otherwise a base block
 * **ramps** linearly from 85 % to full across its weeks, while build, peak and
 * race blocks stay flat — they raise intensity instead, never both at once (D6).
 */
export function weekFactor(facts: {
  weekIndex: number;
  weeksInBlock: number;
  purpose: BlockPurpose;
  daysToRace: number;
}): number {
  if (facts.daysToRace <= TAPER_NEAR_DAYS) return TAPER_NEAR;
  if (facts.daysToRace <= TAPER_FAR_DAYS) return TAPER_FAR;
  if (facts.weeksInBlock < MIN_WEEKS_FOR_WAVE) return 1;
  if (facts.weekIndex === facts.weeksInBlock) return DELOAD;
  if (facts.purpose !== 'base') return 1;
  return rampFactor(facts.weekIndex, facts.weeksInBlock);
}

/** 0.85 on the first week, 1.0 on the last before the deload, evenly spaced between. */
function rampFactor(weekIndex: number, weeksInBlock: number): number {
  const rampWeeks = weeksInBlock - 1;
  // `weekFactor` has already returned for a block of fewer than three weeks,
  // so `rampWeeks` is at least two here and the division always has a divisor.
  const step = (1 - RAMP_FROM) / (rampWeeks - 1);
  return round3(RAMP_FROM + (weekIndex - 1) * step);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The minute split across the week (D7). */
const LONG_SHARE = 0.3;
const HARD_SHARE = 0.15;
const MIN_MINUTES = 30;
const MIN_LONG_MINUTES = 45;

/** The easy days cycle in this order from Monday (D8). */
const EASY_CYCLE = ['swim', 'run', 'bike'] as const;

const EASY_TITLE = { swim: 'Easy swim', run: 'Easy run', bike: 'Easy ride' } as const;
const HARD_TITLE = {
  Tempo: { run: 'Run tempo', bike: 'Bike tempo' },
  Intensity: { run: 'Run intervals', bike: 'Bike intervals' },
} as const;

/**
 * One week as rows.
 *
 * The roles come from `weekSkeleton`; what lands on them is D6–D10. The long
 * day is a ride, or a brick once the race is close enough for it to teach
 * something (§09). The hard day alternates run and bike week by week so
 * neither discipline carries every hard session. Easy days cycle swim → run →
 * bike from Monday. When the hours buy fewer sessions than there are plannable
 * days, the earliest easy days become rest — the long and hard days are the
 * week's shape and are never the ones dropped.
 */
export function weekSessions(input: {
  window: PlanningWindow;
  purpose: BlockPurpose;
  factor: number;
  hours: number;
  isoWeekOdd: boolean;
  deload: boolean;
}): ArithmeticSession[] {
  const days = keptDays(weekSkeleton(input.window), sessionsPerWeek(input.hours));
  // Stryker disable next-line ConditionalExpression — what this guards is the division in `minuteSplit`; with no days there are no rows to map over either way, so its absence is unobservable.
  if (days.length === 0) return [];

  const split = minuteSplit(days, Math.round(input.hours * 60 * input.factor));

  let easyIndex = 0;
  return days.map((day) => {
    if (day.role === 'long') return longSession(day.date, split.long, input);
    if (day.role === 'hard') return hardSession(day.date, split.hard, input);
    return easySession(day.date, split.easy, easyIndex++, input.deload);
  });
}

/**
 * The week's minutes across its three kinds of day (D7): the long day takes
 * 30 %, the hard day 15 %, the easy days share what is left.
 *
 * With few sessions that split can hand a single easy day more than the long
 * day — 55 % against 30 % — and a "long ride" that is the week's second
 * longest session is a lie. So the easy day is capped at the long day's
 * minutes and the surplus goes back to the long day, which keeps the week's
 * total intact.
 */
function minuteSplit(days: SkeletonDay[], minutes: number): { long: number; hard: number; easy: number } {
  const hasLong = days.some((d) => d.role === 'long');
  const hasHard = days.some((d) => d.role === 'hard');
  const easyCount = days.filter((d) => d.role === 'easy').length;
  const long = hasLong ? minutes * LONG_SHARE : 0;
  const hard = hasHard ? minutes * HARD_SHARE : 0;
  const easyShare = minutes - long - hard;
  // A week with any plannable day at all has at least one easy day: under three
  // days the skeleton makes them all easy, and at three or more it puts the long
  // and hard days at the end and leaves the rest easy.
  const easy = easyShare / easyCount;
  // Stryker disable next-line EqualityOperator — `<` and `<=` differ only at easy === long, which the 55/30 split cannot produce: it needs 1.83 easy days.
  if (!hasLong || easy <= long) return { long, hard, easy };
  // Stryker disable next-line ArithmeticOperator — the cap only ever fires with exactly one easy day (easy > long needs easyCount < 1.84), where * and / agree.
  return { long: long + (easy - long) * easyCount, hard, easy: long };
}

/** The skeleton's plannable days, trimmed from Monday to the number of sessions the hours buy. */
function keptDays(skeleton: SkeletonDay[], sessions: number): SkeletonDay[] {
  const plannable = skeleton.filter((d) => d.role !== 'rest');
  let toDrop = Math.max(plannable.length - sessions, 0);
  return plannable.filter((day) => {
    // Stryker disable next-line ConditionalExpression — the skeleton puts the hard day immediately after the easy run, so at the smallest session count the drop stops there anyway; the role test states the intent rather than changing the outcome.
    if (toDrop > 0 && day.role === 'easy') {
      toDrop -= 1;
      return false;
    }
    return true;
  });
}

function longSession(date: string, minutes: number, input: { purpose: BlockPurpose }): ArithmeticSession {
  // A brick in the sharp end of the plan: riding then running off the bike is
  // what the race actually asks for, and it is worth the cost only once the
  // base is there (§09).
  const brick = input.purpose === 'peak' || input.purpose === 'race';
  return {
    date,
    sport: brick ? 'brick' : 'bike',
    type: 'Endurance',
    durationMinutes: floorMinutes(minutes, MIN_LONG_MINUTES),
    zone: 'Z2',
    title: brick ? 'Long brick' : 'Long ride',
    note: null,
  };
}

function hardSession(
  date: string,
  minutes: number,
  input: { purpose: BlockPurpose; isoWeekOdd: boolean; deload: boolean },
): ArithmeticSession {
  // Volume or intensity, never both (D6): a base week's hard day is a tempo,
  // and so is a deload or taper week's, whatever block it falls in.
  const type: PlanType = input.purpose === 'base' || input.deload ? 'Tempo' : 'Intensity';
  const sport = input.isoWeekOdd ? 'run' : 'bike';
  return {
    date,
    sport,
    type,
    durationMinutes: floorMinutes(minutes, MIN_MINUTES),
    zone: type === 'Tempo' ? 'Z3' : 'Z4',
    title: HARD_TITLE[type][sport],
    note: null,
  };
}

function easySession(date: string, minutes: number, index: number, deload: boolean): ArithmeticSession {
  const sport = EASY_CYCLE[index % EASY_CYCLE.length];
  return {
    date,
    sport,
    type: deload ? 'Recovery' : 'Endurance',
    durationMinutes: floorMinutes(minutes, MIN_MINUTES),
    zone: deload ? 'Z1' : 'Z2',
    title: EASY_TITLE[sport],
    note: null,
  };
}

/** Whole minutes, never below the floor — a 20-minute session is not worth the trip. */
function floorMinutes(minutes: number, floor: number): number {
  return Math.max(Math.round(minutes), floor);
}

/** How much of the current block must be left before the next one is filled too (D11). */
const LOOKAHEAD_DAYS = 14;

/**
 * Every session a block owes the calendar.
 *
 * One Mon–Sun week at a time, from the week `firstDay` falls in to the week
 * the block ends in, with the week's factor taken from where it sits in the
 * block and how close race day is. Nothing lands before `firstDay` (the
 * athlete's own start, `training-architecture/36`; today until that ships) and
 * nothing on or after race day — the race is not a training session, and the
 * days after it belong to whatever comes next.
 */
export interface BlockContext {
  raceDate: string;
  hours: number;
  /** The recurring no-train days; absent when the athlete has set none. */
  fixedConstraints?: string[];
  unavailableDates: string[];
  firstDay: string;
}

export function blockSessions(block: TrainingBlock, ctx: BlockContext): ArithmeticSession[] {
  const from = later(block.startDate, ctx.firstDay);
  const weeks = weekStartsBetween(from, block.endDate);
  const purpose = blockPurpose(block.index, block.total);

  return weeks.flatMap((weekStart, i) => {
    // One factor per week, read twice: it sets the week's minutes, and the
    // weeks cut to a deload or a taper are the ones that drop their intensity.
    const factor = weekFactor({
      weekIndex: i + 1,
      weeksInBlock: weeks.length,
      purpose,
      daysToRace: daysBetween(weekStart, ctx.raceDate),
    });
    return weekSessions({
      window: wholeWeekWindow(weekStart, ctx.fixedConstraints, ctx.unavailableDates),
      purpose,
      factor,
      hours: ctx.hours,
      isoWeekOdd: isoWeekOdd(weekStart),
      // A deload week, or a taper week, which behaves like one (D9). A base
      // block's ramp weeks carry 0.85 and 0.925 and are ordinary training
      // weeks — reading "less than full" as "deload" turned their easy days
      // into Recovery (Standards review, 2026-09-23).
      deload: factor <= DELOAD,
    }).filter((row) => row.date >= from && row.date < ctx.raceDate);
  });
}

/**
 * The weeks the structure owes, and which block each belongs to.
 *
 * The current block always; the next one as well once two weeks or less of the
 * current remain, so the calendar is never empty at a boundary. A week that
 * already holds a planned session — the Coach's, a Head Coach's, or the
 * structure's own from an earlier run — is left alone, which is what makes
 * calling this on every app open idempotent.
 */
/** A week the structure owes the calendar, and the block it belongs to. */
export interface DueWeek {
  block: TrainingBlock;
  weekStart: string;
}

export function weeksToFill(facts: {
  today: string;
  blocks: readonly TrainingBlock[];
  plannedWeeks: ReadonlySet<string>;
}): DueWeek[] {
  const currentIndex = facts.blocks.findIndex((b) => b.startDate <= facts.today && facts.today <= b.endDate);
  if (currentIndex === -1) return [];

  const current = facts.blocks[currentIndex];
  const due = [current];
  const next = facts.blocks[currentIndex + 1];
  if (next && daysBetween(facts.today, current.endDate) <= LOOKAHEAD_DAYS) due.push(next);

  return due.flatMap((block) =>
    weekStartsBetween(later(block.startDate, facts.today), block.endDate)
      .filter((weekStart) => !facts.plannedWeeks.has(weekStart))
      .map((weekStart) => ({ block, weekStart })),
  );
}

/** The later of two date keys — equal keys give that key, whichever side it came from. */
// Stryker disable next-line EqualityOperator — `>` and `>=` differ only when the two are equal, and then both return the same key.
const later = (a: string, b: string): string => (a > b ? a : b);

/** Every Monday from the week `from` falls in through the week `to` falls in. */
function weekStartsBetween(from: string, to: string): string[] {
  const weeks: string[] = [];
  for (let week = weekStartOf(from); week <= to; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

/** Whether the week's ISO number is odd — the hard day alternates on it (D8). */
export function isoWeekOdd(weekStart: string): boolean {
  const thursday = new Date(`${addDays(weekStart, 3)}T00:00:00Z`);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return week % 2 === 1;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );
}
