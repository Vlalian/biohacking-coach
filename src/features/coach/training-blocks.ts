import { addDays } from '@/lib/date';

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
 * **Nothing is stored.** Blocks are derived on every read from `today` and the
 * Target Race, which is what makes "boundaries never shift because training was
 * missed" true by construction rather than by discipline — no session, status or
 * history is an input here, and there is no column for one to be written into.
 * The Training Phase this replaces did the opposite: `computePhase` ran once at
 * onboarding, stored a string, and nothing ever recomputed it, so an athlete who
 * onboarded eleven months out was still `Base Building` in race week and every
 * Coach prompt read that string as fact.
 *
 * Pure, and modelled on {@link ../coach/planning-window.ts planningWindow} for
 * that reason: no clock, no database, no network.
 */

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
    return { index, total, name: `Block ${index} of ${total}`, startDate, endDate };
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
