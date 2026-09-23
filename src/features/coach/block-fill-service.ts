import 'server-only';

import { getAthleteById } from '@/features/athlete/athlete-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { getSessionsForAthlete, insertArithmeticSessions } from '@/features/session/session-repository';
import { logCoachFailure } from '@/lib/coach-log';
import { weekStartOf } from '@/lib/date';
import { blockSessions, weeksToFill, type ArithmeticSession, type BlockContext, type DueWeek } from './block-sessions';
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

  // No race is an ordinary state, not a failure: the Coach still plans the
  // week, there is simply no horizon to hang a block structure off.
  if (!resolved.race || resolved.blocks.length === 0) return 'no-race';
  // Hours are asked in onboarding (`training-architecture/35`) and null for
  // anyone who onboarded before the question existed. Nothing is invented from
  // an absent answer — the structure waits until the athlete says.
  if (!athlete || athlete.hoursPerWeek === null) return 'no-hours';

  return planFor({
    athleteId,
    today,
    raceDate: resolved.race.date,
    distance: toRaceDistance(resolved.race.distance),
    hours: athlete.hoursPerWeek,
    fixedConstraints: athlete.profile?.fixedConstraints,
    blocks: resolved.blocks,
  });
}

/** The weeks owed and the context to draw them with, or why there is nothing owed. */
async function planFor(facts: {
  athleteId: string;
  today: string;
  raceDate: string;
  distance: RaceDistance | null;
  hours: number;
  fixedConstraints: string[] | undefined;
  blocks: TrainingBlock[];
}): Promise<FillOutcome | FillPlan> {
  const { athleteId, today } = facts;
  const due = weeksToFill({ today, blocks: facts.blocks, plannedWeeks: await plannedWeeks(athleteId) });
  if (due.length === 0) return 'nothing-due';

  return {
    due,
    ctx: {
      raceDate: facts.raceDate,
      distance: facts.distance,
      hours: facts.hours,
      fixedConstraints: facts.fixedConstraints,
      unavailableDates: await getUnavailableDates(athleteId),
      // `firstDay` is the athlete's own start once `training-architecture/36`
      // asks for it; until then the structure starts today.
      firstDay: today,
    },
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

/** The origins that count as "this week is planned" — the athlete's own additions do not. */
const PLAN_ORIGINS: readonly string[] = ['coach', 'head_coach', 'arithmetic'];
