/**
 * The decisions behind `scripts/briefing-length.ts` (showable-version/19),
 * kept apart from its reads and prints so they can be tested: what the script
 * measures, and how a reply is measured.
 */

export const DEFAULT_BRANCH = 'seed-template';
export const DEFAULT_PERSONAS = ['Alex Rivera', 'Sam Chen'];

export interface BriefingLengthArgs {
  /** The personas' `syntheticLabel`s. */
  names: string[];
  /** The Neon branch to read; the personas live on `seed-template`. */
  branch: string;
  /** Whether to send each prompt to the model once. */
  call: boolean;
  /** The day the briefing is built for. */
  today: string;
}

/** A plain branch name: on Windows the CLI runs through a shell, and only this shape may reach it. */
const BRANCH_NAME = /^[\w./-]+$/;

/** The operand after the option at `i`; a missing one, or another option, is refused rather than eaten. */
function valueAfter(argv: readonly string[], i: number): string {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${argv[i]} needs a value`);
  return value;
}

/** The options that take a value, and the field each one sets. A Map, so `constructor` is not an option. */
const VALUE_OPTIONS = new Map<string, 'branch' | 'today'>([
  ['--branch', 'branch'],
  ['--today', 'today'],
]);

export function parseBriefingLengthArgs(argv: readonly string[], todayKey: string): BriefingLengthArgs {
  const parsed: BriefingLengthArgs = { names: [], branch: DEFAULT_BRANCH, call: false, today: todayKey };
  for (let i = 0; i < argv.length; i++) {
    const field = VALUE_OPTIONS.get(argv[i]);
    if (field) parsed[field] = valueAfter(argv, i++);
    else if (argv[i] === '--call') parsed.call = true;
    else parsed.names.push(argv[i]);
  }
  if (!BRANCH_NAME.test(parsed.branch)) throw new Error(`Not a branch name: ${parsed.branch}`);
  return { ...parsed, names: parsed.names.length > 0 ? parsed.names : DEFAULT_PERSONAS };
}

/** Words: runs of non-space characters. */
export const words = (s: string): number => (s.match(/\S+/g) ?? []).length;

/**
 * Sentences: each `.`, `!` or `?` followed by a space or the end of the text,
 * so a stop inside `3.5` does not count and `?!` counts once. A trailing
 * fragment with no mark is not a sentence (the 2026-09-23 counts on
 * showable-version/19 used an earlier splitter that counted it; the
 * difference is at most one per reply).
 */
export const sentences = (s: string): number => (s.match(/[.!?](?=\s|$)/g) ?? []).length;
