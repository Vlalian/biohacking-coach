import { getAthleteById } from '@/features/athlete/athlete-repository';
import { getActiveLink, getLinkForAthlete } from './coach-repository';
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
  repinBlockSet,
  resolveBlocks,
  trainingBlocks,
  validateBlockSet,
  type BlockEditInput,
  type BlockEditProblem,
  type BlockSetProblem,
  type TrainingBlock,
  type TrainingBlockSpec,
  fitsRace,
  holdsHeadCoachBlock,
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
 * do. A set that ends on race day is done. A stale set that holds a Head Coach
 * block is theirs **while the athlete has an active Coaching Link** — the Coach
 * may suggest through the Briefing, never redraw; the Head Coach re-pins it
 * from the popup on login (`training-architecture/19`). The authority rule
 * protects a relationship, not a kind of person (CONTEXT.md), so once the link
 * is severed nobody is left to repair the set and the ordinary redraft runs
 * (ruling 2, 2026-09-15). The link is read only when it decides something:
 * the common path — no set, or a set that fits — costs no extra query.
 * Anything else (no set, or a stale one the Coach itself drafted) is open.
 */
async function gateOn(set: BlockSetRecord | null, race: RaceRow): Promise<AdjustmentOutcome | null> {
  if (!set) return null;
  if (fitsRace(set, race.date)) return 'already-adjusted';
  if (!holdsHeadCoachBlock(set)) return null;
  return (await getLinkForAthlete(set.athleteId)) ? 'head-coach-owned' : null;
}

/**
 * The eight-week rule keeps the Coach from redrawing a plan close to the race.
 * It protects a plan that still describes the race; a set past {@link gateOn}
 * with a human's block still in it is stale with nobody linked to repair it,
 * and that one is re-fitted whatever the distance (Mads, 2026-09-19, on
 * ruling 2 of `training-architecture/19`).
 */
function tooCloseToRedraw(today: string, race: RaceRow, existing: BlockSetRecord | null): boolean {
  if (weeksTo(today, race.date) >= MIN_WEEKS_TO_ADJUST) return false;
  return existing === null || !holdsHeadCoachBlock(existing);
}

/** Everything the briefing carries, gathered in one round of reads. */
async function gatherContext(
  athleteId: string,
  today: string,
  race: RaceRow,
  draft: TrainingBlock[],
  language: string | undefined,
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
    language,
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
        // The solo case (19, ruling 2): a former Head Coach's blocks no longer
        // fit the moved race and nobody is linked to re-pin them, so the Coach
        // re-fits the set — and says whose blocks it was, rather than announce
        // a fresh draft over a human's structure as if it had never been there.
        ...(existing && holdsHeadCoachBlock(existing) ? { refittedHeadCoachBlocks: true } : {}),
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
 *
 * `language` is the Athlete Language, read by the caller through the user seam
 * (`ui_prefs`), as the Weekly Session's is: the block names the Coach writes
 * here are the ones the athlete reads, so a Danish athlete's are Danish
 * (showable-version/46). Absent means English.
 */
export async function ensureBlocksAdjusted(
  athleteId: string,
  today: string,
  language?: string,
): Promise<AdjustmentOutcome> {
  // Same rule as the week draft: a switched-off Coach is an outcome, not a
  // failure, and costs no read and no log.
  if (isCoachDisabled()) return 'coach-disabled';
  const race = await getTargetRace(athleteId);
  if (!race) return 'no-race';
  const existing = await getBlockSet(athleteId, race.id);
  const gated = await gateOn(existing, race);
  if (gated) return gated;
  if (tooCloseToRedraw(today, race, existing)) return 'too-close';

  const ctx = await gatherContext(athleteId, today, race, trainingBlocks(today, race.date), language);
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
  // Coach redraws the set (07) or a Head Coach re-pins it from the popup on
  // login (19, `repinBlockSetAsHeadCoach`).
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

// ── The Head Coach's re-pin (slice 19) ────────────────────────────────────────

export type RepinBlockSetServiceResult =
  | { ok: true; version: number }
  // In order: no active link; not the Target Race or already run; nothing
  // stored; the set already ends on race day (someone got there first).
  | { ok: false; reason: 'not-linked' | 'no-race' | 'no-set' | 'not-stale' }
  // The race moved so early that fewer than two blocks survive: the row offers
  // the arithmetic draft instead, and says what would have gone.
  | { ok: false; reason: 'too-few-blocks'; dropped: string[] }
  | { ok: false; reason: 'invalid'; problem: BlockSetProblem }
  // The set changed under the popup — the refusal carries what won (ADR 0010).
  | { ok: false; reason: 'conflict'; current: BlockSetSnapshot };

interface HeadCoachRepair {
  headCoachId: string;
  athleteId: string;
  raceId: string;
  /** The version the popup showed; never one read here, or the check passes by construction. */
  expectedVersion: number;
  today: string;
}

/**
 * The race and the stale set a repair applies to, or the refusal that stops
 * it. Link gate first, and nothing below it runs without one: an absent Head
 * Coach repairs nothing.
 */
async function loadStaleTarget(
  params: HeadCoachRepair,
): Promise<{ race: RaceRow; set: BlockSetRecord } | RepinBlockSetServiceResult> {
  const { headCoachId, athleteId, raceId, today } = params;
  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };

  const race = await editableRace(athleteId, raceId, today);
  if (!race) return { ok: false, reason: 'no-race' };

  const set = await getBlockSet(athleteId, race.id);
  if (!set) return { ok: false, reason: 'no-set' };
  if (fitsRace(set, race.date)) return { ok: false, reason: 'not-stale' };
  return { race, set };
}

/** The CAS write of a repair, its `blocks_repinned` event riding the same statement. */
async function writeRepair(
  repair: HeadCoachRepair,
  target: { race: RaceRow; set: BlockSetRecord },
  write: { blocks: TrainingBlockSpec[]; startDate?: string; dropped: string[]; restarted?: true },
): Promise<RepinBlockSetServiceResult> {
  const { headCoachId, athleteId, expectedVersion } = repair;
  const { blocks, startDate, dropped, restarted } = write;
  const { race, set } = target;
  const written = await casUpdateBlockSet({
    athleteId,
    setId: set.id,
    expectedVersion,
    blocks,
    ...(startDate ? { startDate } : {}),
    events: [
      {
        actorType: 'head_coach',
        actorId: headCoachId,
        type: 'blocks_repinned',
        payload: {
          raceId: race.id,
          raceName: race.name,
          from: set.blocks[set.blocks.length - 1].endDate,
          to: race.date,
          dropped,
          ...(restarted ? { restarted } : {}),
        },
      },
    ],
  });
  if (written.ok) return { ok: true, version: written.version };

  const current = await getBlockSet(athleteId, race.id);
  return { ok: false, reason: 'conflict', current: snapshotOf(current ?? set) };
}

/**
 * A linked Head Coach re-pins a stale set to the race's new date in one click
 * (`training-architecture/19`, ruling 1): a human's structure stays a human's,
 * so the repair is theirs, not the Coach's. Link gate, then the pure
 * {@link repinBlockSet}, then a compare-and-swap on the version the popup was
 * showing, the event in the same statement — a repair that lost writes nothing
 * and announces nothing. The set's start is untouched: the blocks that survive
 * are the same blocks, on the same days.
 */
export async function repinBlockSetAsHeadCoach(params: HeadCoachRepair): Promise<RepinBlockSetServiceResult> {
  const target = await loadStaleTarget(params);
  if ('ok' in target) return target;

  const repinned = repinBlockSet(target.set, target.race.date);
  if (!repinned.ok) {
    return repinned.reason === 'too-few-blocks'
      ? { ok: false, reason: 'too-few-blocks', dropped: repinned.dropped }
      : { ok: false, reason: 'invalid', problem: repinned.reason };
  }
  return writeRepair(params, target, { blocks: repinned.blocks, dropped: repinned.dropped });
}

/**
 * The other button: a race moved so early that re-pinning leaves fewer than
 * two blocks, so the Head Coach starts over from the arithmetic draft. The
 * draft is materialised from today, every block `arithmetic`, over the stale
 * set by the same CAS — it replaces rather than deletes, because the race
 * keeps its id and a delete-then-insert would race 07's background draft on
 * the unique index. Announced as a re-pin that dropped every old block, with
 * `restarted` set, so the athlete hears one sentence either way.
 */
export async function restartBlockSetFromDraftAsHeadCoach(
  params: HeadCoachRepair,
): Promise<RepinBlockSetServiceResult> {
  const target = await loadStaleTarget(params);
  if ('ok' in target) return target;

  // Never empty: `editableRace` has already refused a race on or before today.
  const draft = trainingBlocks(params.today, target.race.date).map(({ name, endDate, authoredBy }) => ({
    name,
    endDate,
    authoredBy,
  }));
  return writeRepair(params, target, {
    blocks: draft,
    startDate: params.today,
    dropped: target.set.blocks.map((b) => b.name),
    restarted: true,
  });
}
