/**
 * `npm run feedback`'s one option, kept apart from the script's reads and
 * prints so it can be tested (showable-version/48):
 *
 *     npm run feedback -- --since 2026-09-30
 *
 * keeps only what was written on or after the start of that day, in UTC.
 */

import { renderFeedbackReport, sinceFilter, type FeedbackReportInput } from '../src/features/feedback/feedback-report';

export interface FeedbackArgs {
  since?: Date;
}

/** The operand after the option at `i`; a missing one, or another option, is refused rather than eaten. */
function valueAfter(argv: readonly string[], i: number): string {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${argv[i]} needs a value`);
  return value;
}

/**
 * The start of a calendar day in UTC. Anything that does not read back as the
 * same YYYY-MM-DD is refused: another shape, a date that does not exist
 * (2026-02-30), or no date at all.
 */
function dayStart(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`--since takes a date as YYYY-MM-DD, not ${value}`);
  }
  return date;
}

function parseFeedbackArgs(argv: readonly string[]): FeedbackArgs {
  const parsed: FeedbackArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--since') throw new Error(`unknown option: ${argv[i]}`);
    parsed.since = dayStart(valueAfter(argv, i++));
  }
  return parsed;
}

/**
 * The text `npm run feedback` prints, from its arguments and a way to read the
 * rows. The arguments are checked before anything is read, so a typo costs no
 * database round trip.
 */
export async function feedbackReport(argv: readonly string[], read: () => Promise<FeedbackReportInput>): Promise<string> {
  const { since } = parseFeedbackArgs(argv);
  const input = await read();
  return renderFeedbackReport(since ? sinceFilter(input, since) : input);
}
