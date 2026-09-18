import { getAthleteById } from '@/features/athlete/athlete-repository';
import { getActiveLink } from './coach-repository';
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
import { callCoach, isCoachDisabled } from './coach-client';
import { renderBlockAdjustmentPrompt } from './prompts';
import {
  casUpdateBlockSet,
  getBlockSet,
  insertBlockSet,
  type BlockSetRecord,
} from './training-block-repository';
import {
  applyBlockEdit,
  resolveBlocks,
  trainingBlocks,
  validateBlockSet,
  type BlockEditInput,
  type BlockEditProblem,
  type TrainingBlock,
  type TrainingBlockSpec,
  fitsRace,
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
  | 'coach-disabled'
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
  if (fitsRace(set, race.date)) return 'already-adjusted';
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
  // Both sentences ride the set write, each gated on it landing: a loser writes
  // neither, and a verdict cannot be lost between two statements.
  const evts = [
    {
      actorType: 'coach_ai' as const,
      actorId: null,
      type: 'blocks_drafted',
      payload: {
        raceId: race.id,
        raceName: race.name,
        blocks: adjustment.blocks.map(({ name, endDate }) => ({ name, endDate })),
      },
    },
    // Not a re-plan: the blocks are written regardless. This is the one extra
    // sentence, and it is rare by instruction.
    ...(adjustment.unrealistic
      ? [
          {
            actorType: 'coach_ai' as const,
            actorId: null,
            type: 'race_flagged_unrealistic',
            payload: { raceId: race.id, raceName: race.name, reason: adjustment.unrealistic.reason },
          },
        ]
      : []),
  ];

  const won = existing
    ? (
        await casUpdateBlockSet({
          athleteId,
          setId: existing.id,
          expectedVersion: existing.version,
          blocks: adjustment.blocks,
          // The redraft was validated from today, so the set starts today.
          startDate: today,
          events: evts,
        })
      ).ok
    : (await insertBlockSet({
        athleteId,
        raceId: race.id,
        startDate: today,
        blocks: adjustment.blocks,
        events: evts,
      })) === 'inserted';
  if (!won) return 'lost-race';
  return 'drafted';
}

/**
 * Makes sure this athlete's Target Race has a Coach-shaped block set, drafting
 * one if it does not. Idempotent and cheap on the common path: one race read
 * and one set read, then nothing. Never throws.
 */
export async function ensureBlocksAdjusted(athleteId: string, today: string): Promise<AdjustmentOutcome> {
  // Same rule as the week draft: a switched-off Coach is an outcome, not a
  // failure, and costs no read and no log.
  if (isCoachDisabled()) return 'coach-disabled';
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

// ── The Head Coach's edit (slice 08) ──────────────────────────────────────────

/** What the panel needs to show what won when an edit is refused for conflict. */
export interface BlockSetSnapshot {
  version: number;
  startDate: string;
  blocks: TrainingBlockSpec[];
}

export type EditBlockResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'not-linked' | 'no-race' }
  // The stored set no longer ends on race day (the race moved). The coach's
  // panel shows the arithmetic draft; the rows underneath are the old set, so
  // an edit by position would land on blocks nobody is looking at — and the
  // CAS would let it through, because the version matches. Refused until the
  // Coach redraws the set (07) or a Head Coach re-pins it, which is not built.
  | { ok: false; reason: 'stale-set' }
  | { ok: false; reason: 'invalid'; problem: BlockEditProblem }
  // The set changed under the coach — 07's background draft, or another
  // session. The refusal carries what won (ADR 0010).
  | { ok: false; reason: 'conflict'; current: BlockSetSnapshot };

function snapshotOf(set: BlockSetRecord): BlockSetSnapshot {
  return { version: set.version, startDate: set.startDate, blocks: set.blocks };
}

/**
 * The stored set the edit applies to, materialising the arithmetic draft when
 * the athlete has none yet.
 *
 * Materialising writes every block `arithmetic` and announces nothing: nothing
 * was adjusted, so there is nothing to tell the athlete. If the insert loses
 * to 07's background draft racing on the same row, the re-read set is what the
 * Coach wrote — positions the Head Coach never saw — so the honest answer is a
 * conflict carrying it, never an edit applied blind on top.
 */
async function setToEdit(
  athleteId: string,
  race: RaceRow,
  today: string,
): Promise<
  | { set: BlockSetRecord; materialised: boolean }
  | { conflict: BlockSetSnapshot }
  // A word rather than `{ stale: true }`: the value of such a flag is never
  // read (the key is the discriminant), so a boolean there is a literal no test
  // can pin. The gate said so.
  | 'stale'
  | null
> {
  const existing = await getBlockSet(athleteId, race.id);
  if (existing) return fitsRace(existing, race.date) ? { set: existing, materialised: false } : 'stale';

  // Never empty: `editableRace` has already refused a race on or before today,
  // and every later date divides into at least two blocks.
  const draft = trainingBlocks(today, race.date).map(({ name, endDate, authoredBy }) => ({
    name,
    endDate,
    authoredBy,
  }));
  const outcome = await insertBlockSet({ athleteId, raceId: race.id, startDate: today, blocks: draft });
  const stored = await getBlockSet(athleteId, race.id);
  if (!stored) return null;
  return outcome === 'inserted' ? { set: stored, materialised: true } : { conflict: snapshotOf(stored) };
}

/**
 * A linked Head Coach renames a block or moves its end (`training-architecture/08`).
 *
 * Link gate, then content, then a compare-and-swap on the version the coach's
 * panel was showing — never a version read here, or the check would pass by
 * construction. The `block_edited` event rides in the CAS statement, so an edit
 * that lost writes nothing and announces nothing. With no active link nothing
 * below the first line runs: an absent Head Coach blocks nothing.
 */
export async function editBlockAsHeadCoach(params: {
  headCoachId: string;
  athleteId: string;
  raceId: string;
  position: number;
  input: BlockEditInput;
  /** The version the panel showed; ignored when the set had to be materialised first. */
  expectedVersion: number;
  today: string;
}): Promise<EditBlockResult> {
  const { headCoachId, athleteId, raceId, position, input, expectedVersion, today } = params;

  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };

  const target = await loadTarget(athleteId, raceId, today);
  if ('ok' in target) return target;

  const applied = applyBlockEdit(target.set, position, input, target.race.date);
  if (!applied.ok) return { ok: false, reason: 'invalid', problem: applied.reason };

  return writeEdit({
    athleteId,
    headCoachId,
    raceId,
    set: target.set,
    // The panel's version is meaningless for a set that did not exist a moment
    // ago; the materialised set is at version 1 and that is what must match.
    expectedVersion: target.materialised ? target.set.version : expectedVersion,
    position,
    blocks: applied.blocks,
  });
}

/**
 * The race and the set an edit applies to, or the refusal that stops it: no
 * Target Race, a race id that is not the target, a race already run, or a
 * materialising insert lost to the Coach's draft (a conflict carrying what won).
 */
async function loadTarget(
  athleteId: string,
  raceId: string,
  today: string,
): Promise<{ race: RaceRow; set: BlockSetRecord; materialised: boolean } | EditBlockResult> {
  const race = await editableRace(athleteId, raceId, today);
  if (!race) return { ok: false, reason: 'no-race' };

  const target = await setToEdit(athleteId, race, today);
  if (!target) return { ok: false, reason: 'no-race' };
  if (target === 'stale') return { ok: false, reason: 'stale-set' };
  if ('conflict' in target) return { ok: false, reason: 'conflict', current: target.conflict };
  return { race, ...target };
}

/**
 * The Target Race an edit may apply to, or null: it must be the athlete's
 * current target, the one the panel named, and still ahead. A race already run
 * has a set worth reading and nothing worth editing — before this check an
 * existing set stayed editable after race day (CodeRabbit, PR #65).
 */
async function editableRace(athleteId: string, raceId: string, today: string): Promise<RaceRow | null> {
  const race = await getTargetRace(athleteId);
  if (!race || race.id !== raceId || race.date <= today) return null;
  return race;
}

/** The CAS and its event, and the re-read that tells a refused coach what won. */
async function writeEdit(params: {
  athleteId: string;
  headCoachId: string;
  raceId: string;
  set: BlockSetRecord;
  expectedVersion: number;
  position: number;
  blocks: TrainingBlockSpec[];
}): Promise<EditBlockResult> {
  const { athleteId, headCoachId, raceId, set, expectedVersion, position, blocks } = params;
  const from = set.blocks[position - 1];
  const to = blocks[position - 1];
  const written = await casUpdateBlockSet({
    athleteId,
    setId: set.id,
    expectedVersion,
    blocks,
    events: [
      {
        actorType: 'head_coach',
        actorId: headCoachId,
        type: 'block_edited',
        payload: {
          raceId,
          position,
          from: { name: from.name, endDate: from.endDate },
          to: { name: to.name, endDate: to.endDate },
        },
      },
    ],
  });
  if (written.ok) return { ok: true, version: written.version };

  const current = await getBlockSet(athleteId, raceId);
  return { ok: false, reason: 'conflict', current: snapshotOf(current ?? set) };
}
