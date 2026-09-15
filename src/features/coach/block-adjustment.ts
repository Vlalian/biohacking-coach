import { assertNoDirectIdentifier, type Readiness, type WeekFeedbackEntry } from './check-in';
import type { CoachTool } from './coach-client';
import type { TrainingBlock, TrainingBlockSpec } from './training-blocks';

/**
 * Stage 2 of a Training Block (`training-architecture/07`): what the Coach is
 * briefed with when it adjusts the arithmetic draft, and the shape of what it
 * hands back.
 *
 * Pure, like `weekly-session.ts`: plain data in, plain data out. The service
 * gathers the facts and makes the call; this module says what the facts are and
 * reads the reply. The prompt itself is rendered in `prompts.ts` beside the
 * other Coach prompts, so the golden test pins it with them.
 *
 * **The prompt is a briefing, not a coaching manual.** It carries the facts the
 * app knows — the draft, the horizon, the athlete's experience, capacity,
 * Check-in and recent Session Reflections — and the rules of the shape it must
 * return. What a block *should* be for is the model's judgement, and adding
 * heuristics here would be the app pretending to that judgement (plan 07,
 * "the prompt is the one place to invent").
 */

/** The facts the adjustment prompt is rendered from. */
export interface BlockAdjustmentContext {
  today: string;
  race: { name: string; date: string; distance: string | null };
  /** Whole weeks from today to race day, floored. */
  weeksToRace: number;
  /** The arithmetic draft the Coach is asked to shape. */
  draft: TrainingBlock[];
  experienceLevel?: string;
  /** What an open Injury or Illness prevents, already rendered (ADR 0011). */
  capacity: string | null;
  readiness: Readiness | null;
  notableSignal: string | null;
  /** The last four weeks' rated sessions. */
  reflections: WeekFeedbackEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function weeksBetween(from: string, to: string): number {
  const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS;
  return Math.floor(days / 7);
}

/**
 * Assembles the context and asserts the detectable identifiers are absent from
 * every free-text leaf that reaches the prompt: the Check-in's sentence and the
 * reflection comments. The same backstop `buildWeeklyCheckIn` applies, for the
 * same reason — this string goes to the model, and a name or an email in it
 * would go too (GDPR decision 1).
 */
export function buildBlockAdjustmentContext(
  input: Omit<BlockAdjustmentContext, 'weeksToRace'>,
): BlockAdjustmentContext {
  assertNoDirectIdentifier(input.notableSignal);
  for (const r of input.reflections) assertNoDirectIdentifier(r.comment);
  return { ...input, weeksToRace: weeksBetween(input.today, input.race.date) };
}

// ── The tool ──────────────────────────────────────────────────────────────────

export const ADJUST_TRAINING_BLOCKS_TOOL_NAME = 'adjust_training_blocks';

/**
 * The tool the Coach calls with the shaped set. SDK-free, like
 * `PROPOSE_WEEK_PLAN_TOOL`; the adapter casts once. The shape is deliberately
 * the minimum: names and end dates. Starts are derived, authorship is the app's
 * to stamp, and anything more would be a field the model could disagree with
 * the validator about.
 */
export const ADJUST_TRAINING_BLOCKS_TOOL: CoachTool = {
  name: ADJUST_TRAINING_BLOCKS_TOOL_NAME,
  description:
    'Record the shaped Training Blocks for this athlete: every block, in order, ' +
    'named for what it achieves, with the date it ends. The last block must end ' +
    'on race day. Call it exactly once, with the whole set. Set `unrealistic` ' +
    'only in the rare case the race cannot be reached on this horizon.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      blocks: {
        type: 'array',
        description: 'Two to six blocks, in order, contiguous from today to race day.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: {
              type: 'string',
              description: 'What the block achieves, in at most four words. Never a position.',
            },
            endDate: { type: 'string', description: 'The last day of the block, YYYY-MM-DD.' },
          },
          required: ['name', 'endDate'],
        },
      },
      unrealistic: {
        type: 'object',
        description:
          'Only when the race is genuinely out of reach on this horizon. Almost never set.',
        additionalProperties: false,
        properties: {
          reason: { type: 'string', description: 'One plain sentence the athlete could be told.' },
        },
        required: ['reason'],
      },
    },
    required: ['blocks'],
  },
};

/** What the Coach handed back, shape-checked and stamped `coach_ai`. */
export interface BlockAdjustment {
  blocks: TrainingBlockSpec[];
  unrealistic: { reason: string } | null;
}

function specFrom(entry: unknown): TrainingBlockSpec | null {
  // A null or primitive entry has no `name`, so it falls out on the same check
  // as a malformed object — one rule for every non-block.
  const raw = (entry ?? {}) as { name?: unknown; endDate?: unknown };
  if (typeof raw.name !== 'string' || typeof raw.endDate !== 'string') return null;
  return { name: raw.name, endDate: raw.endDate, authoredBy: 'coach_ai' };
}

function unrealisticFrom(input: unknown): { reason: string } | null {
  // `input` is an object by the time this runs — the caller has already read a
  // `blocks` array off it — so only the inner hop can be missing.
  const reason = (input as { unrealistic?: { reason?: unknown } | null }).unrealistic?.reason;
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  return trimmed ? { reason: trimmed } : null;
}

/**
 * The tool input as an adjustment, or null when it is not even the right shape.
 *
 * Shape only. Whether the set is *acceptable* — count, contiguity, race-day
 * pinning, purpose-shaped names — is `validateBlockSet`'s question, and keeping
 * the two apart is what lets the service log "malformed" and "refused: short"
 * as the different failures they are.
 */
export function adjustmentFromToolInput(input: unknown): BlockAdjustment | null {
  const raw = (input as { blocks?: unknown } | null | undefined)?.blocks;
  if (!Array.isArray(raw)) return null;
  const blocks = raw.map(specFrom);
  if (blocks.some((b) => b === null)) return null;
  return { blocks: blocks as TrainingBlockSpec[], unrealistic: unrealisticFrom(input) };
}
