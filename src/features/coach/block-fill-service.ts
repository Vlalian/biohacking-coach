import 'server-only';

import { getAthleteById } from '@/features/athlete/athlete-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import {
  getSessionsForAthlete,
  insertArithmeticSessions,
  replaceArithmeticWeeks,
} from '@/features/session/session-repository';
import { logCoachFailure } from '@/lib/coach-log';
import { weekStartOf } from '@/lib/date';
import {
  blockSessions,
  PLAN_ORIGINS,
  weeksToFill,
  weeksToRefill,
  type ArithmeticSession,
  type BlockContext,
  type DueWeek,
} from './block-sessions';
import type { TrainingBlock } from './training-blocks';
import { toRaceDistance, type RaceDistance } from '@/lib/race-distances';
import { getResolvedBlocks } from './training-block-service';

/**
 * Keeping the calendar full beyond this week (`training-architecture/34`).
 *
 * The athlete friend's complaint on 2026-09-19: past the current week the
 * calendar is empty, so there is no plan to look at. The blocks were already
 * drawn; nothing filled them. This does — the structure writes real sessions
 * for every week of the current block, and the Coach's weekly draft replaces
 * them as it lands.
 *
 * Idempotent by the week: a week that already holds a planned session — the
 * Coach's, a Head Coach's, or the structure's own from an earlier open — is
 * never filled again. So this can run on every app open, which is how it runs:
 * there is no cron, and `ensureWeekDrafted` established the pattern.
 *
 * Never throws. It runs inside `after()` on a page the athlete is already
 * looking at, and a dead driver must not take that page down with it.
 */
export type FillOutcome = 'no-race' | 'no-hours' | 'nothing-due' | 'no-plannable-day' | 'filled' | 'failed';

export async function ensureBlockFilled(athleteId: string, today: string): Promise<FillOutcome> {
  try {
    return await fill(athleteId, today);
  } catch (error) {
    logCoachFailure({ surface: 'block_fill', athleteId, conversationId: null, error });
    return 'failed';
  }
}

async function fill(athleteId: string, today: string): Promise<FillOutcome> {
  const ready = await readyToFill(athleteId, today);
  if (typeof ready === 'string') return ready;

  const rows = owedRows(ready.due, ready.ctx);
  // Every owed week can still come out empty — an athlete who has ruled out
  // every day of the week has no plannable day for the structure to use.
  if (rows.length === 0) return 'no-plannable-day';
  await insertArithmeticSessions(athleteId, rows);
  return 'filled';
}

/** What the fill needs, or the outcome that says why there is nothing to do. */
type FillPlan = { due: DueWeek[]; ctx: BlockContext };

async function readyToFill(athleteId: string, today: string): Promise<FillOutcome | FillPlan> {
  const [athlete, resolved] = await Promise.all([
    getAthleteById(athleteId),
    getResolvedBlocks(athleteId, today),
  ]);
  const facts = drawFacts(athlete, resolved);
  if (typeof facts === 'string') return facts;
  return planFor({ athleteId, today, ...facts });
}

/** What the structure draws from: the race, the hours and the blocks. */
type DrawFacts = {
  raceDate: string;
  distance: RaceDistance | null;
  hours: number;
  fixedConstraints: string[] | undefined;
  blocks: TrainingBlock[];
};

/** The facts a fill or a redraw draws from, or why there are none. */
function drawFacts(
  athlete: Awaited<ReturnType<typeof getAthleteById>>,
  resolved: Awaited<ReturnType<typeof getResolvedBlocks>>,
): 'no-race' | 'no-hours' | DrawFacts {
  // No race is an ordinary state, not a failure: the Coach still plans the
  // week, there is simply no horizon to hang a block structure off.
  if (!resolved.race || resolved.blocks.length === 0) return 'no-race';
  // Hours are asked in onboarding (`training-architecture/35`) and null for
  // anyone who onboarded before the question existed. Nothing is invented from
  // an absent answer — the structure waits until the athlete says.
  if (!athlete || athlete.hoursPerWeek === null) return 'no-hours';

  return {
    raceDate: resolved.race.date,
    distance: toRaceDistance(resolved.race.distance),
    hours: athlete.hoursPerWeek,
    fixedConstraints: athlete.profile?.fixedConstraints,
    blocks: resolved.blocks,
  };
}

/** The weeks owed and the context to draw them with, or why there is nothing owed. */
async function planFor(facts: DrawFacts & { athleteId: string; today: string }): Promise<FillOutcome | FillPlan> {
  const { athleteId, today } = facts;
  const due = weeksToFill({ today, blocks: facts.blocks, plannedWeeks: await plannedWeeks(athleteId) });
  if (due.length === 0) return 'nothing-due';

  return { due, ctx: await drawContext(facts) };
}

/** Everything `blockSessions` draws with, read the same way for a fill and a redraw. */
async function drawContext(
  facts: Omit<DrawFacts, 'blocks'> & { athleteId: string; today: string },
): Promise<BlockContext> {
  return {
    raceDate: facts.raceDate,
    distance: facts.distance,
    hours: facts.hours,
    fixedConstraints: facts.fixedConstraints,
    unavailableDates: await getUnavailableDates(facts.athleteId),
    // `firstDay` is the athlete's own start once `training-architecture/36`
    // asks for it; until then the structure starts today.
    firstDay: facts.today,
  };
}

/**
 * The sessions the owed weeks are owed, and nothing else.
 *
 * A block is drawn once however many of its weeks are due, and the rows it
 * returns are then cut to the owed weeks — `blockSessions` fills a whole block,
 * and a week somebody has already planned is not this function's to write.
 */
function owedRows(due: DueWeek[], ctx: BlockContext): ArithmeticSession[] {
  // One block owns each week. A block ends mid-week and the next starts the day
  // after, so inside the lookahead one Mon–Sun week is owed by both — and
  // `blockSessions` draws a whole week whichever block asked for it. Without an
  // owner the shared days would each carry two sessions, two long rides on the
  // same Sunday among them (CodeRabbit, PR #98). The earlier block draws it,
  // because that is the block the athlete is still in.
  const owner = new Map<string, TrainingBlock>();
  for (const week of due) if (!owner.has(week.weekStart)) owner.set(week.weekStart, week.block);

  return [...new Set(owner.values())].flatMap((block) =>
    blockSessions(block, ctx).filter((row) => owner.get(weekStartOf(row.date)) === block),
  );
}

/**
 * The weeks that already hold a planned session, whoever wrote it. A completed
 * or skipped session does not hold a week: it is a record of what happened,
 * and the rest of that week is still unplanned.
 */
async function plannedWeeks(athleteId: string): Promise<Set<string>> {
  const sessions = await getSessionsForAthlete(athleteId);
  return new Set(
    sessions
      .filter((s) => s.status === 'planned' && PLAN_ORIGINS.includes(s.origin))
      .map((s) => weekStartOf(s.date)),
  );
}

// ── The redraw after an hours change (showable-version/40) ──────────────────

/**
 * What an hours change did: the outcome, and the weeks it redrew (empty unless
 * `refilled`).
 */
export type RefillResult = {
  outcome: 'refilled' | 'nothing-due' | 'no-race' | 'no-hours' | 'failed';
  weeks: string[];
};

/**
 * Redraws the weeks the structure still owns from the athlete's current hours.
 *
 * `ensureBlockFilled` fills a week once and never again, so without this an
 * hours change in Settings would change nothing the athlete can see. Only the
 * weeks {@link weeksToRefill} names are touched — after this one, not accepted,
 * no Head Coach prescription — and the repository's delete is scoped to the
 * structure's own planned rows as a second guard. A draft already pending for
 * next week was drafted from the old hours and is left alone: withdrawing it is
 * drafting behaviour, not this function's.
 *
 * Never throws, for the same reason the fill does not: the caller is a
 * Settings save the athlete is waiting on, and the hours are already stored.
 */
export async function refillWeeksFromHours(athleteId: string, today: string): Promise<RefillResult> {
  try {
    return await refill(athleteId, today);
  } catch (error) {
    logCoachFailure({ surface: 'block_fill', athleteId, conversationId: null, error });
    return { outcome: 'failed', weeks: [] };
  }
}

/** The weeks {@link refillWeeksFromHours} would redraw today — a read, for the confirmation. */
export async function previewRefill(athleteId: string, today: string): Promise<string[]> {
  const [resolved, sessions] = await Promise.all([
    getResolvedBlocks(athleteId, today),
    getSessionsForAthlete(athleteId),
  ]);
  return weeksOf(redrawDue(resolved.blocks, weeksToRefill({ today, sessions })));
}

async function refill(athleteId: string, today: string): Promise<RefillResult> {
  const [athlete, resolved, sessions] = await Promise.all([
    getAthleteById(athleteId),
    getResolvedBlocks(athleteId, today),
    getSessionsForAthlete(athleteId),
  ]);
  const facts = drawFacts(athlete, resolved);
  if (typeof facts === 'string') return { outcome: facts, weeks: [] };

  const due = redrawDue(facts.blocks, weeksToRefill({ today, sessions }));
  if (due.length === 0) return { outcome: 'nothing-due', weeks: [] };

  const ctx = await drawContext({ athleteId, today, ...facts });
  const weeks = weeksOf(due);
  await replaceArithmeticWeeks(athleteId, weeks, owedRows(due, ctx));
  return { outcome: 'refilled', weeks };
}

/**
 * Each redrawable week paired with the blocks that have not ended before it, in
 * block order — the shape `owedRows` reads. Its owner rule takes the first, which
 * is the block the week starts in, so a week straddling a boundary is drawn by
 * the earlier block exactly as the fill draws it. A week past the last block is
 * paired with nothing and left alone.
 */
function redrawDue(blocks: readonly TrainingBlock[], weeks: readonly string[]): DueWeek[] {
  return blocks.flatMap((block) =>
    weeks.filter((weekStart) => weekStart <= block.endDate).map((weekStart) => ({ block, weekStart })),
  );
}

/** The distinct weeks of a due list, in order. */
function weeksOf(due: readonly DueWeek[]): string[] {
  return [...new Set(due.map((d) => d.weekStart))];
}
