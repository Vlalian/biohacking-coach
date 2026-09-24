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

export function parseBriefingLengthArgs(argv: readonly string[], todayKey: string): BriefingLengthArgs {
  const names: string[] = [];
  let branch = DEFAULT_BRANCH;
  let call = false;
  let today = todayKey;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--call') call = true;
    else if (a === '--branch') branch = valueAfter(argv, i++);
    else if (a === '--today') today = valueAfter(argv, i++);
    else names.push(a);
  }
  if (!BRANCH_NAME.test(branch)) throw new Error(`Not a branch name: ${branch}`);
  return { names: names.length > 0 ? names : DEFAULT_PERSONAS, branch, call, today };
}

export const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

export const sentences = (s: string): number => s.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim()).length;
