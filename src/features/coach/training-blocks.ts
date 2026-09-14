import { addDays, isValidDateKey } from '@/lib/date';

/**
 * Training Blocks — the arithmetic first draft (`training-architecture/03`).
 *
 * A Training Block is a named span of weeks with one purpose, **two to six**
 * across a horizon (*Distancens Arkitektur* §15: *"Del forløbet i 2–6 blokke med
 * hvert sit formål"*). How many depends on how much time there actually is —
 * §15 asks *"Hvor mange faser tillader tidshorisonten reelt?"* — so an athlete
 * eighteen months out and one seven months out do not get the same structure.
 *
 * **This is stage 1 of three, and deliberately unremarkable.** Its job is that a
 * block structure always exists, including for the athlete nobody is coaching.
 * The Coach adjusting the draft is slice 07 and the Head Coach overriding it is
 * slice 08; the draft is not meant to be good yet without them.
 *
 * **The arithmetic stores nothing.** Its blocks are derived on every read from
 * `today` and the Target Race, which is what makes "boundaries never shift
 * because training was missed" true by construction rather than by discipline —
 * no session, status or history is an input here. The Training Phase this
 * replaces did the opposite: `computePhase` ran once at onboarding, stored a
 * string, and nothing ever recomputed it, so an athlete who onboarded eleven
 * months out was still `Base Building` in race week and every Coach prompt read
 * that string as fact.
 *
 * **Stage 2 (slice 07) does store.** Once the Coach has adjusted the draft, the
 * result is a {@link StoredBlockSet} — a set of purpose-shaped names and end
 * dates pinned to one race — and {@link resolveBlocks} is the one place that
 * decides whether a stored set or the arithmetic is what the athlete sees. A
 * stored set is still not a record of training done: it is invalidated by the
 * race moving, never by a session being missed.
 *
 * Pure, and modelled on {@link ../coach/planning-window.ts planningWindow} for
 * that reason: no clock, no database, no network.
 */

/**
 * Who decided a block's name and end date.
 *
 * `arithmetic` is stage 1's formula, `coach_ai` is the Coach's adjustment
 * (slice 07), `head_coach` is a human's override (slice 08) — and the last word:
 * the Coach never redraws a set with a `head_coach` block in it.
 */
export type BlockAuthor = 'arithmetic' | 'coach_ai' | 'head_coach';

/**
 * One block as it is stored: a name, where it ends, and who said so. The start
 * is derived — block 1 starts on the set's `startDate`, every other block the
 * day after the one before — so contiguity is by construction, not by a second
 * column that could disagree.
 */
export interface TrainingBlockSpec {
  name: string;
  /** Inclusive, `YYYY-MM-DD`. The last block's end is race day. */
  endDate: string;
  authoredBy: BlockAuthor;
}

/** The stored set, as {@link resolveBlocks} reads it. */
export interface StoredBlockSet {
  /** The first block's start, fixed when the set was drafted. */
  startDate: string;
  blocks: TrainingBlockSpec[];
}

/** One span of the horizon. */
export interface TrainingBlock {
  /** 1-based position in the sequence. */
  index: number;
  /** How many blocks the horizon was divided into. */
  total: number;
  /**
   * Generic by design. A formula cannot say what a block is *for* — that is what
   * stages 2 and 3 are — and a name invented here would be the arithmetic
   * pretending to coaching judgment it does not have.
   */
  name: string;
  /** Inclusive, `YYYY-MM-DD`. */
  startDate: string;
  /** Inclusive, `YYYY-MM-DD`. The last block's end is race day. */
  endDate: string;
  authoredBy: BlockAuthor;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

/**
 * How many blocks a horizon of this many weeks will carry.
 *
 * Deliberately a plain, monotone table rather than anything cleverer. §15 gives
 * a **range** and a question, not a formula, so stage 1 answers it in the
 * simplest way that respects both ends of the range and gets more phases as
 * more time allows. It is written down here rather than hidden inside the
 * division precisely so it is easy to argue with when slice 07 has a better one.
 */
function blockCountFor(weeks: number): number {
  if (weeks < 8) return 2;
  if (weeks < 16) return 3;
  if (weeks < 28) return 4;
  if (weeks < 44) return 5;
  return 6;
}

/**
 * The blocks between `today` and the Target Race, or none.
 *
 * `raceDate` is null for an athlete who has no race — a real, expected state
 * rather than an error, and the same one an athlete in a Recovery Period is in
 * (slice 10). The Coach still plans their week; it simply plans without a
 * horizon to build toward. A race that has already happened leaves nothing to
 * divide either.
 *
 * Blocks are laid out **backwards from race day**, so the race is the fixed
 * point the structure hangs off and the final block always ends on it. The
 * remainder falls in the first block, which is the one the athlete is standing
 * in and the only one whose length is an accident of when they were asked.
 */
export function trainingBlocks(today: string, raceDate: string | null): TrainingBlock[] {
  if (!raceDate) return [];

  const days = daysBetween(today, raceDate);
  if (days <= 0) return [];

  const total = blockCountFor(days / 7);
  const blockDays = Math.floor(days / total);

  return Array.from({ length: total }, (_, i) => {
    const index = i + 1;
    // Every block but the first is measured back from race day, so its
    // boundaries depend on the race rather than on when this was asked.
    const endDate = addDays(raceDate, -(total - index) * (blockDays + 1));
    const startDate = index === 1 ? today : addDays(endDate, -blockDays);
    return {
      index,
      total,
      name: `Block ${index} of ${total}`,
      startDate,
      endDate,
      authoredBy: 'arithmetic',
    };
  });
}

/**
 * The Training Phase: the name of the block today falls inside, or null.
 *
 * Derived on every read from `today` plus stored facts — the same shape as
 * `planningWindow` — because asking "what phase is the athlete in" is now a
 * question about where today sits, not a lookup of something written down once.
 *
 * Null is an ordinary answer, not a failure: an athlete with no Target Race has
 * no blocks, and every surface that reads a phase has to render that without
 * erroring. Note that the phase is consequently **no longer a closed set** —
 * nothing may switch on its value.
 */
export function currentPhase(today: string, blocks: TrainingBlock[]): string | null {
  return currentBlock(today, blocks)?.name ?? null;
}

/**
 * The block today falls inside, or null.
 *
 * The one place that search lives. Callers wanting both the phase and the
 * position inside it were writing the same `find` twice, and a duplicated
 * predicate is one that can drift — the two would then disagree about which
 * block the athlete is in while both looked right.
 */
export function currentBlock(today: string, blocks: TrainingBlock[]): TrainingBlock | null {
  return blocks.find((b) => today >= b.startDate && today <= b.endDate) ?? null;
}

/** Where inside a block a given day falls. */
export interface BlockPosition {
  /** 1-based week within the block. */
  week: number;
  /** How many weeks the block runs for. */
  weeks: number;
}

/**
 * The athlete's position inside a block.
 *
 * Which block is not enough on its own: the first week of a block and its last
 * call for different sessions, and "Block 2 of 5" says the same thing for six
 * weeks running. The Coach prompt carries both.
 *
 * Clamped to the block rather than allowed to run past either end, because a
 * "week 0" or a "week 9 of 8" in a prompt is a number the model will reason
 * from and nobody meant.
 */
export function blockPosition(today: string, block: TrainingBlock): BlockPosition {
  const span = daysBetween(block.startDate, block.endDate) + 1;
  const weeks = Math.max(1, Math.ceil(span / 7));
  const elapsed = daysBetween(block.startDate, today);
  const week = Math.floor(Math.min(Math.max(elapsed, 0), span - 1) / 7) + 1;
  return { week: Math.min(week, weeks), weeks };
}

// ── The stored set (slice 07) ─────────────────────────────────────────────────

/** Why a set was refused. A closed list so a caller can log it without prose. */
export type BlockSetProblem = 'count' | 'end' | 'date' | 'order' | 'short' | 'name' | 'positional';

export type ValidateBlockSetResult = { ok: true } | { ok: false; reason: BlockSetProblem };

const MIN_BLOCKS = 2;
const MAX_BLOCKS = 6;
const MIN_BLOCK_DAYS = 7;
const MAX_NAME_LENGTH = 40;

/**
 * A name that is only a position — the arithmetic's own shape. Stage 2 exists to
 * replace these, so a Coach reply that hands one back has not done the job.
 *
 * Refused only where someone was meant to name the block. An `arithmetic` block
 * keeps its positional name by definition: a Head Coach who renames one block
 * of a materialised draft leaves the others as the formula made them, and that
 * set is still valid (slice 08).
 */
const POSITIONAL_NAME = /^(block|phase|fase)\s*\d/i;

function nameProblemOf(block: TrainingBlockSpec): BlockSetProblem | null {
  const trimmed = block.name.trim();
  if (trimmed === '' || trimmed.length > MAX_NAME_LENGTH) return 'name';
  return block.authoredBy !== 'arithmetic' && POSITIONAL_NAME.test(trimmed) ? 'positional' : null;
}

/**
 * The first span that is out of order or too short, walking the derived starts.
 *
 * A block that ends on or before the one before it has no days at all, which is
 * `order`; one with some days but fewer than a week is `short`. Both come from
 * the same arithmetic so they are found in one pass.
 */
function spanProblemOf(blocks: TrainingBlockSpec[], startDate: string): BlockSetProblem | null {
  let start = startDate;
  for (const block of blocks) {
    const days = daysBetween(start, block.endDate) + 1;
    if (days <= 0) return 'order';
    if (days < MIN_BLOCK_DAYS) return 'short';
    start = addDays(block.endDate, 1);
  }
  return null;
}

/**
 * Whether a set may be stored and shown to the athlete.
 *
 * Checked in the order a reader would notice: how many, whether the dates are
 * dates at all, whether it ends on race day, then the spans and the names. The
 * result is a refusal reason rather than a boolean because the caller — a Coach
 * tool reply, or a Head Coach's edit — has to say *what* was wrong, and a
 * validator that only says "no" makes that sentence a guess.
 */
/** The set as a whole: how many, whether the dates are dates, whether it ends on race day. */
function shapeProblemOf(blocks: TrainingBlockSpec[], raceDate: string): BlockSetProblem | null {
  if (blocks.length < MIN_BLOCKS || blocks.length > MAX_BLOCKS) return 'count';
  if (!blocks.every((b) => isValidDateKey(b.endDate))) return 'date';
  return blocks[blocks.length - 1].endDate === raceDate ? null : 'end';
}

export function validateBlockSet(
  blocks: TrainingBlockSpec[],
  startDate: string,
  raceDate: string,
): ValidateBlockSetResult {
  const problem =
    shapeProblemOf(blocks, raceDate) ??
    spanProblemOf(blocks, startDate) ??
    blocks.map(nameProblemOf).find((p) => p) ??
    null;
  return problem ? { ok: false, reason: problem } : { ok: true };
}

/** A stored set as the blocks every reader consumes, starts derived. */
export function expandBlockSet(set: StoredBlockSet): TrainingBlock[] {
  const total = set.blocks.length;
  let start = set.startDate;
  return set.blocks.map((spec, i) => {
    const block: TrainingBlock = {
      index: i + 1,
      total,
      name: spec.name,
      startDate: start,
      endDate: spec.endDate,
      authoredBy: spec.authoredBy,
    };
    start = addDays(spec.endDate, 1);
    return block;
  });
}

/**
 * The blocks the athlete actually has: the stored set when it still fits the
 * race, otherwise the arithmetic draft.
 *
 * "Still fits" means its last block ends on race day. A race that moved leaves a
 * set that no longer describes the horizon, and the honest rendering is the
 * arithmetic for the new date — not a set ending two weeks before or after the
 * race. The stale set is **ignored, never deleted**: the next adjustment run
 * replaces it, and until then nothing has been thrown away.
 *
 * Because the stored set carries its own `startDate`, its boundaries are the
 * same on any day it is read — the property the arithmetic cannot have (ticket
 * 13's boundary drift) and the one that makes a block a thing the Coach can name.
 */
export function resolveBlocks(
  today: string,
  race: { date: string } | null,
  stored: StoredBlockSet | null,
): TrainingBlock[] {
  if (!race) return [];
  if (stored && stored.blocks[stored.blocks.length - 1]?.endDate === race.date) {
    return expandBlockSet(stored);
  }
  return trainingBlocks(today, race.date);
}

// ── The Head Coach's edit (slice 08) ──────────────────────────────────────────

/** What a Head Coach may change on one block: its name, its end, or both. */
export interface BlockEditInput {
  name?: string;
  endDate?: string;
}

/** Why an edit was refused before it reached the validator, or by it. */
export type BlockEditProblem = 'position' | 'nothing' | 'last-block-end' | 'boundary' | BlockSetProblem;

export type ApplyBlockEditResult =
  | { ok: true; blocks: TrainingBlockSpec[] }
  | { ok: false; reason: BlockEditProblem };

/**
 * Whether a new end date sits strictly between the neighbours' ends — the
 * previous block keeps at least a day, the next block keeps at least a day.
 * The seven-day floor is the validator's; this is only the ordering.
 */
function boundaryProblem(set: StoredBlockSet, index: number, endDate: string): BlockEditProblem | null {
  const previousEnd = index === 0 ? addDays(set.startDate, -1) : set.blocks[index - 1].endDate;
  const nextEnd = set.blocks[index + 1].endDate;
  return endDate > previousEnd && endDate < nextEnd ? null : 'boundary';
}

/**
 * One block renamed and/or re-bounded by the Head Coach, as the new set — or a
 * refusal (`training-architecture/08`).
 *
 * Rename and re-boundary only: adding or removing a block is not the Head
 * Coach's authority here, and the shape of this function makes that so. The
 * edited block becomes `head_coach`-authored — the mark 07's gate reads to
 * leave the set alone — and every other block's author is untouched, because a
 * human editing one block did not author the others.
 *
 * The next block's start follows automatically: starts are derived, so moving
 * an end moves exactly one boundary. The last block's end is race day and
 * cannot move (the plan pins to the race, never the other way round).
 */
/** What can be wrong with a new end date, before the set validator sees the whole set. */
function endDateProblemOf(set: StoredBlockSet, index: number, endDate: string): BlockEditProblem | null {
  if (index === set.blocks.length - 1) return 'last-block-end';
  if (!isValidDateKey(endDate)) return 'date';
  return boundaryProblem(set, index, endDate);
}

/** The refusals an edit can earn before the set validator sees it. */
function editProblemOf(set: StoredBlockSet, index: number, input: BlockEditInput): BlockEditProblem | null {
  if (!set.blocks[index]) return 'position';
  if (input.name === undefined && input.endDate === undefined) return 'nothing';
  return input.endDate === undefined ? null : endDateProblemOf(set, index, input.endDate);
}

export function applyBlockEdit(
  set: StoredBlockSet,
  position: number,
  input: BlockEditInput,
  raceDate: string,
): ApplyBlockEditResult {
  const index = position - 1;
  const problem = editProblemOf(set, index, input);
  if (problem !== null) return { ok: false, reason: problem };
  const current = set.blocks[index];

  const edited: TrainingBlockSpec = {
    name: (input.name ?? current.name).trim(),
    endDate: input.endDate ?? current.endDate,
    authoredBy: 'head_coach',
  };
  const blocks = set.blocks.map((b, i) => (i === index ? edited : b));
  const verdict = validateBlockSet(blocks, set.startDate, raceDate);
  return verdict.ok ? { ok: true, blocks } : { ok: false, reason: verdict.reason };
}
