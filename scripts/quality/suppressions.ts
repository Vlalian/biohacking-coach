/**
 * The suppressions a gated run let through, each with the reason its author
 * wrote (code-health/31).
 *
 * Stryker reports a comment suppression as `Ignored`, but it reads a reason
 * only after a **colon** (`// Stryker disable next-line X: reason`). `/onkel`
 * prescribes an **em-dash**, so for most of this repo Stryker's `statusReason`
 * is its own default, "Ignored using a comment", and says nothing. The reason
 * is therefore read from the source, here — a pure function of text, so the
 * parsing can be mutation-tested like the rest of the gate.
 */

import type { MutantReport } from './policy';
import type { ChangedFile } from './scope';

const DIRECTIVE = /Stryker disable next-line\b/;

/** One suppressed mutant, located, with the reason its comment gives. */
export type Suppression = { file: string; line: number; mutator: string; commentLine: number; reason: string | null };

/**
 * The suppressions split by whether this change wrote them. `unsplit` when
 * there is no diff to tell by (`--whole-file`, or git could not say): claiming
 * "already there" without a diff would hide a new one.
 */
export type SuppressionList = { new: Suppression[]; existing: Suppression[] } | { unsplit: Suppression[] };

/** Where a mutant's suppression comment starts, and the reason written on it. */
export type SuppressionReason = { commentLine: number; reason: string | null };

/** A `//` line comment, indented or not; the capture is its text. */
const COMMENT = /^\s*\/\/(.*)/;
/** The reason: whatever follows the first em-dash or colon. */
const AFTER_SEPARATOR = /[—:](.*)/;

/** A line's comment text, trimmed, or null for code, a blank line, or a line before the file starts. */
const commentOf = (line: string | undefined): string | null => line?.match(COMMENT)?.[1].trim() ?? null;

/** The 0-based index of the directive heading the comment block that ends just above `line`, if any. */
function directiveAbove(lines: string[], line: number): number | null {
  for (let at = line - 2; ; at -= 1) {
    const text = commentOf(lines[at]);
    if (text === null) return null;
    if (DIRECTIVE.test(text)) return at;
  }
}

/**
 * The `Stryker disable next-line` comment block directly above `line` (1-based),
 * and its reason, or null when no such block sits there. The reason follows the
 * first em-dash or colon after the directive, and runs on through the comment
 * lines below it.
 */
export function suppressionReason(source: string, line: number): SuppressionReason | null {
  const lines = source.split('\n');
  const at = directiveAbove(lines, line);
  if (at === null) return null;

  const [, afterDirective] = (commentOf(lines[at]) as string).split(DIRECTIVE);
  const opening = afterDirective.match(AFTER_SEPARATOR);
  const continuation = lines.slice(at + 1, line - 1).map((l) => commentOf(l) as string);
  const reason = opening ? [opening[1], ...continuation].join(' ').trim() : '';
  return { commentLine: at + 1, reason: reason === '' ? null : reason };
}

/**
 * Every `Ignored` mutant in a run, located with its reason. A comment above the
 * mutant supplies the reason; without one (a config-level ignore) Stryker's own
 * `ignoreReason` stands, and the mutant's line stands in for the comment's.
 */
export function suppressionsOf(
  mutants: MutantReport[],
  sourceOf: (file: string) => string | undefined,
): Suppression[] {
  return mutants
    .filter((m) => m.status === 'Ignored')
    .map((m) => {
      const source = sourceOf(m.file);
      const found = source === undefined ? null : suppressionReason(source, m.line);
      return {
        file: m.file,
        line: m.line,
        mutator: m.mutator,
        commentLine: found?.commentLine ?? m.line,
        reason: found ? found.reason : (m.ignoreReason ?? null),
      };
    });
}

/** A suppression is new when its comment line is one this change added or modified. */
export function classifySuppressions(items: Suppression[], changed: ChangedFile[] | null): SuppressionList {
  if (changed === null) return { unsplit: items };
  const isNew = (s: Suppression): boolean =>
    changed.some(({ file, ranges }) => file === s.file && ranges.some(([start, end]) => s.commentLine >= start && s.commentLine <= end));
  return { new: items.filter(isNew), existing: items.filter((s) => !isNew(s)) };
}
