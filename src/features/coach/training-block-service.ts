import { getAthleteById } from '@/features/athlete/athlete-repository';
import { capacityFor } from '@/features/health/health-repository';
import { getTargetRace } from '@/features/race/race-repository';
import { getSessionsForAthlete } from '@/features/session/session-repository';
import type { RaceRow } from '@/db/schema';
import { logBlockAdjustmentRefused, logCoachFailure } from '@/lib/coach-log';
import { addDays, weekStartOf } from '@/lib/date';
import {
  ADJUST_TRAINING_BLOCKS_TOOL,
  ADJUST_TRAINING_BLOCKS_TOOL_NAME,
  adjustmentFromToolInput,
  buildBlockAdjustmentContext,
  type BlockAdjustment,
  type BlockAdjustmentContext,
} from './block-adjustment';
import { getCheckInForWeek } from './check-in-repository';
import { notableSignalFrom, readinessFrom } from './check-in';
import { callCoach } from './coach-client';
import { renderBlockAdjustmentPrompt } from './prompts';
import {
  casUpdateBlockSet,
  getBlockSet,
  insertBlockEvent,
  insertBlockSet,
  type BlockSetRecord,
} from './training-block-repository';
import {
  resolveBlocks,
  trainingBlocks,
  validateBlockSet,
  type TrainingBlock,
} from './training-blocks';
import { weekFeedbackFrom } from './weekly-session';

/**
 * Training Blocks, stage 2 (`training-architecture/07`): the Coach takes the
 * arithmetic draft and shapes it for this athlete, once per Target Race, in the
 * background. The result is stored; every prompt that reads blocks reads it
 * through {@link getResolvedBlocks}.
 *
 * {@link ensureBlocksAdjusted} is the single swappable entry point — the trigger
 * (`after()` on the Training Plan page) is a thin shell, as the 2026-08-12
 * generation decision asked. It never throws: a failed adjustment leaves the
 * athlete exactly where stage 1 left them, on the arithmetic draft, and says so
 * in the log rather than in the render.
 *
 * Every read and write below is scoped to the athlete id resolved upstream
 * (ADR 0006). Nothing here reads a name or an email; the free text that reaches
 * the prompt passes the same identifier backstop as the Weekly Session's.
 */

/** Below this the arithmetic makes two blocks and there is nothing to shape. */
const MIN_WEEKS_TO_ADJUST = 8;
/** How far back the Coach reads Session Reflections. */
const REFLECTION_WEEKS = 4;
const ADJUSTMENT_MAX_TOKENS = 800;
/** What the model is told after the tool call, so the follow-up costs one line. */
const ADJUSTMENT_ACK = 'Recorded. Reply with one word.';

export interface ResolvedBlocks {
  race: RaceRow | null;
  /** The stored set, whether or not it still fits the race; null when none. */
  set: BlockSetRecord | null;
  blocks: TrainingBlock[];
}

/**
 * The blocks this athlete actually has today: the stored set when it fits the
 * race, otherwise the arithmetic draft. The one place the prompt readers and
 * the UI get blocks from, so they cannot disagree.
 */
export async function getResolvedBlocks(athleteId: string, today: string): Promise<ResolvedBlocks> {
  const race = await getTargetRace(athleteId);
  if (!race) return { race: null, set: null, blocks: [] };
  const set = await getBlockSet(athleteId, race.id);
  return { race, set, blocks: resolveBlocks(today, race, set) };
}

/** Why a run ended where it did. Returned for the log and the tests; the trigger ignores it. */
export type AdjustmentOutcome =
  | 'no-race'
  | 'too-close'
  | 'already-adjusted'
  | 'head-coach-owned'
  | 'coach-failed'
  | 'malformed'
  | 'refused'
  | 'lost-race'
  | 'drafted';

function weeksTo(today: string, raceDate: string): number {
  const days =
    (new Date(`${raceDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
    (24 * 60 * 60 * 1000);
  return days / 7;
}

/**
 * The cheap gate: whether a stored set means there is nothing for the Coach to
 * do. A set that ends on race day is done. A set that holds any Head Coach block
 * is theirs, whether or not it still fits the race — the Coach may suggest
 * through the Briefing, never redraw. Anything else (no set, or a stale one the
 * Coach itself drafted) is open.
 */
function gateOn(set: BlockSetRecord | null, race: RaceRow): AdjustmentOutcome | null {
  if (!set) return null;
  if (set.blocks[set.blocks.length - 1]?.endDate === race.date) return 'already-adjusted';
  if (set.blocks.some((b) => b.authoredBy === 'head_coach')) return 'head-coach-owned';
  return null;
}

/** Everything the briefing carries, gathered in one round of reads. */
async function gatherContext(
  athleteId: string,
  today: string,
  race: RaceRow,
  draft: TrainingBlock[],
): Promise<BlockAdjustmentContext> {
  const since = addDays(today, -REFLECTION_WEEKS * 7);
  const [athlete, capacity, checkInRow, sessions] = await Promise.all([
    getAthleteById(athleteId),
    // The capacity half only; the detail thread has no reader here (ADR 0011).
    capacityFor(athleteId),
    getCheckInForWeek(athleteId, weekStartOf(today)),
    getSessionsForAthlete(athleteId),
  ]);
  return buildBlockAdjustmentContext({
    today,
    race: { name: race.name, date: race.date, distance: race.distance },
    draft,
    experienceLevel: athlete?.experienceLevel ?? undefined,
    capacity,
    readiness: readinessFrom(checkInRow),
    notableSignal: notableSignalFrom(checkInRow),
    reflections: weekFeedbackFrom(sessions.filter((s) => s.date >= since && s.date < today)),
  });
}

/**
 * The one Coach call. Returns the shaped set, or the outcome that explains why
 * there is none — a thrown call, no tool call, or a reply the validator refuses
 * all leave the athlete on the arithmetic draft, and each is logged as the
 * different failure it is.
 */
async function askCoach(
  athleteId: string,
  ctx: BlockAdjustmentContext,
): Promise<BlockAdjustment | Exclude<AdjustmentOutcome, 'drafted' | 'lost-race'>> {
  let reply;
  try {
    reply = await callCoach({
      system: renderBlockAdjustmentPrompt(ctx),
      messages: [{ role: 'user', content: 'Shape the training blocks now.' }],
      maxTokens: ADJUSTMENT_MAX_TOKENS,
      tools: [ADJUST_TRAINING_BLOCKS_TOOL],
      toolResult: ADJUSTMENT_ACK,
    });
  } catch (error) {
    logCoachFailure({ surface: 'block_adjustment', athleteId, conversationId: null, error });
    return 'coach-failed';
  }

  const call = reply.toolCalls.find((c) => c.name === ADJUST_TRAINING_BLOCKS_TOOL_NAME);
  const adjustment = call ? adjustmentFromToolInput(call.input) : null;
  if (!adjustment) {
    logBlockAdjustmentRefused(athleteId, 'malformed');
    return 'malformed';
  }

  const verdict = validateBlockSet(adjustment.blocks, ctx.today, ctx.race.date);
  if (!verdict.ok) {
    logBlockAdjustmentRefused(athleteId, verdict.reason);
    return 'refused';
  }
  return adjustment;
}

/**
 * Stores the shaped set as the Coach, announcing it in the same statement.
 *
 * A fresh horizon is an insert; a stale set the Coach itself drafted (the race
 * moved) is a compare-and-swap against the version that was read, because the
 * race keeps its id when its date changes and a second insert would lose on the
 * unique index forever. Either way a loser — a concurrent run that got there
 * first — writes nothing more, including the second event.
 */
async function writeAdjustment(
  athleteId: string,
  race: RaceRow,
  today: string,
  existing: BlockSetRecord | null,
  adjustment: BlockAdjustment,
): Promise<AdjustmentOutcome> {
  const event = {
    actorType: 'coach_ai' as const,
    actorId: null,
    type: 'blocks_drafted',
    payload: {
      raceId: race.id,
      raceName: race.name,
      blocks: adjustment.blocks.map(({ name, endDate }) => ({ name, endDate })),
    },
  };

  const won = existing
    ? (
        await casUpdateBlockSet({
          athleteId,
          setId: existing.id,
          expectedVersion: existing.version,
          blocks: adjustment.blocks,
          event,
        })
      ).ok
    : (await insertBlockSet({
        athleteId,
        raceId: race.id,
        startDate: today,
        blocks: adjustment.blocks,
        event,
      })) === 'inserted';
  if (!won) return 'lost-race';

  // Not a re-plan: the blocks above are written regardless. This is the one
  // extra sentence, and it is rare by instruction.
  if (adjustment.unrealistic) {
    await insertBlockEvent(athleteId, {
      actorType: 'coach_ai',
      actorId: null,
      type: 'race_flagged_unrealistic',
      payload: { raceId: race.id, raceName: race.name, reason: adjustment.unrealistic.reason },
    });
  }
  return 'drafted';
}

/**
 * Makes sure this athlete's Target Race has a Coach-shaped block set, drafting
 * one if it does not. Idempotent and cheap on the common path: one race read
 * and one set read, then nothing. Never throws.
 */
export async function ensureBlocksAdjusted(athleteId: string, today: string): Promise<AdjustmentOutcome> {
  const race = await getTargetRace(athleteId);
  if (!race) return 'no-race';
  if (weeksTo(today, race.date) < MIN_WEEKS_TO_ADJUST) return 'too-close';

  const existing = await getBlockSet(athleteId, race.id);
  const gated = gateOn(existing, race);
  if (gated) return gated;

  const ctx = await gatherContext(athleteId, today, race, trainingBlocks(today, race.date));
  const asked = await askCoach(athleteId, ctx);
  if (typeof asked === 'string') return asked;

  return writeAdjustment(athleteId, race, today, existing, asked);
}
