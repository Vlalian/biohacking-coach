/**
 * What a run of the gate grades — the decisions behind its scope, as pure
 * functions.
 *
 * The rule (`.scratch/onkel/GATE-SCOPE.md`, Mads 2026-09-03) is **grade only
 * the functions the change actually touched**. A violation elsewhere in a file
 * the change edited is recorded, not a blocker. Until code-health/28 the tool
 * did not apply that rule itself: it handed Stryker whole files and judged
 * every function in them, so each build paid the full mutation cost of every
 * big file it touched and then sorted old debt from new by hand.
 *
 * "Touched" is read off `git diff -U0 <base>`: the lines the change added or
 * modified, on the new side. `cli.ts` runs git and hands the text here; every
 * decision about it is made in this module, where it can be mutation-tested.
 */

/** An inclusive, 1-based line range on the new side of a diff. */
export type LineRange = [start: number, end: number];

export type ChangedFile = { file: string; ranges: LineRange[] };

/** `@@ -a[,b] +c[,d] @@` — only the new side matters here. */
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * A `+++ b/<path>` header's path. git ends a name holding a space with a tab,
 * which is cut here. A name holding a quote, a backslash or a control
 * character comes quoted and is not unpicked: no source path in this repo
 * has one.
 */
function headerPath(raw: string): string {
  return raw.split('\t')[0].slice(2);
}

/** The new-side range of one hunk header, or null for a pure deletion. */
function hunkRange(line: string): LineRange | null {
  const match = HUNK.exec(line);
  if (match === null) return null;
  const start = Number(match[1]);
  // An omitted count means one line; a count of 0 means nothing was added.
  const count = match[2] === undefined ? 1 : Number(match[2]);
  return count === 0 ? null : [start, start + count - 1];
}

/**
 * The diff cut at each `diff --git`, one section per file. No line inside a
 * hunk can begin that way — each starts with `+`, `-`, ` ` or `\\`.
 */
function fileSections(diffU0: string): string[][] {
  return diffU0.split(/^diff --git /m).map((section) => section.split(/\r?\n/));
}

/**
 * One file's changed ranges, or null when the section names no new-side file
 * (a rename or mode change with no content, a binary file).
 *
 * The `+++ ` header comes before any hunk, so the first line beginning that
 * way is always the header, never an added line that happens to begin `++ `.
 * A deleted file's header is `+++ /dev/null` and needs no case of its own:
 * its one hunk is `+0,0`, so it carries no range and is dropped with the
 * other empty ones.
 */
function changedFile(section: string[]): ChangedFile | null {
  const header = section.find((line) => line.startsWith('+++ '));
  if (header === undefined) return null;

  const ranges = section.map(hunkRange).filter((r): r is LineRange => r !== null);
  return { file: headerPath(header.slice(4)), ranges };
}

/**
 * The added or modified lines of every file in a `git diff -U0` text.
 *
 * A pure deletion yields no range: there is no new line for a test to be
 * checking. A deleted file, and a rename that changed no content, are absent.
 */
export function changedRanges(diffU0: string): ChangedFile[] {
  return fileSections(diffU0)
    .map(changedFile)
    .filter((f): f is ChangedFile => f !== null && f.ranges.length > 0);
}

export type GateArgs = {
  /** The files named on the command line, as given. */
  paths: string[];
  /** The ref to diff against; unset means the merge-base with `origin/main`. */
  base?: string;
  /** Grade every function in each file — the post-test sweep, and today's behaviour before code-health/28. */
  wholeFile: boolean;
};

/**
 * `npm run quality -- [--whole-file] [--base <ref>] <path…>`.
 *
 * `--base` takes the next argument as its value, so a ref is never graded as
 * a path. Any other flag is ignored rather than read as one.
 */
export function parseArgs(argv: string[]): GateArgs {
  const args: GateArgs = { paths: [], wholeFile: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--whole-file') args.wholeFile = true;
    else if (arg === '--base') args.base = argv[++i];
    else if (arg.startsWith('--base=')) args.base = arg.slice('--base='.length);
    else if (!arg.startsWith('--')) args.paths.push(arg);
  }
  return args;
}

/**
 * A new file git has not been told about. `git diff <base>` leaves it out
 * altogether, and read as "unchanged" a brand-new module would never be
 * graded — so it counts as changed from its first line to its last.
 */
export function untrackedChange(file: string, source: string): ChangedFile {
  // An empty file still counts one line, which is what Stryker needs: it
  // refuses a range that ends before it starts.
  const lines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
  return { file, ranges: [[1, lines]] };
}

/**
 * A repo path as a Stryker `mutate` entry that matches it, and only it.
 *
 * Stryker reads `mutate` as globs, and `[locale]` is a character class: as a
 * glob, `src/app/[locale]/x.ts` names `src/app/l/x.ts` and nothing real, so
 * Stryker found no file, generated no mutants, and the gate reported every
 * server action under the locale segment as clean. `[[]` is the one escape
 * that survives Stryker's own `path.resolve` and backslash-to-slash
 * normalisation of the pattern; a `\[` would be flattened on Windows. It also
 * reads as no glob at all to Stryker's validator, which refuses a glob
 * combined with a line range (checked against `@stryker-mutator/core` 10.0.0).
 */
function asMutateGlob(path: string): string {
  return path.replaceAll('[', '[[]');
}

/**
 * Stryker's `mutate` list: each changed range as `path:start-end`, or, with
 * `changed` null, each whole file.
 *
 * Stryker keeps a mutant only when its whole location sits inside a range, so
 * a survivor can only come from a line the change wrote. A file with no
 * changed lines is absent, and is not mutated at all.
 */
export function mutateEntries(files: string[], changed: ChangedFile[] | null): string[] {
  if (changed === null) return files.map(asMutateGlob);
  return changed
    .filter(({ file }) => files.includes(file))
    .flatMap(({ file, ranges }) =>
      ranges.map(([start, end]) => `${asMutateGlob(file)}:${start}-${end}`),
    );
}

type Span = { file: string; startLine: number; endLine: number };

function touches(fn: Span, changed: ChangedFile[]): boolean {
  return changed.some(
    ({ file, ranges }) =>
      file === fn.file && ranges.some(([start, end]) => fn.startLine <= end && fn.endLine >= start),
  );
}

/**
 * The functions whose numbers decide the verdict, and the ones left standing.
 *
 * A function is touched when its span overlaps a changed range. Everything is
 * still measured; only the touched can fail the run. With `changed` null the
 * run grades whole files, and every function is touched.
 */
export function splitByChange<T extends Span>(
  fns: T[],
  changed: ChangedFile[] | null,
): { touched: T[]; standing: T[] } {
  if (changed === null) return { touched: fns, standing: [] };
  return {
    touched: fns.filter((fn) => touches(fn, changed)),
    standing: fns.filter((fn) => !touches(fn, changed)),
  };
}

/**
 * The named files with no changed line: measured, reported by name, and not
 * graded. With `changed` null the run grades whole files, and none is left out.
 */
export function untouchedFiles(files: string[], changed: ChangedFile[] | null): string[] {
  if (changed === null) return [];
  return files.filter((f) => !changed.some(({ file }) => file === f));
}

/** Stryker's log line saying how many files its `mutate` list resolved to. */
const FOUND = /Found (\d+) of \d+ file\(s\) to be mutated/;

/**
 * Whether a mutation run that produced no mutants should be read as one that
 * missed the change — the `ranMutation` that `judge`'s no-mutants rule keys
 * off.
 *
 * Whole files always did, which is the gate as it was. A changed range need
 * not: a change to a comment or a type alias has no mutant to offer. So a
 * scoped run is suspect only when Stryker's log shows it found fewer files
 * than it was handed — the `[locale]` failure, an entry naming no real file —
 * or does not say what it found, which fails closed.
 *
 * A scoped run in which **no** named file changed is always a miss. It
 * graded nothing and would otherwise print PASS: the branch was already in
 * `origin/main`, `--base` named the commit that holds the change, or the
 * paths were not the change's. The fix is `--whole-file` or a `--base` that
 * predates the change, and the run says so rather than passing.
 */
export function emptyMeansMissed(
  files: string[],
  mutate: string[],
  changed: ChangedFile[] | null,
  strykerLog: string,
): boolean {
  if (changed === null) return mutate.length > 0;
  if (untouchedFiles(files, changed).length === files.length) return true;
  if (mutate.length === 0) return false;
  const found = FOUND.exec(strykerLog);
  // Each entry is `path:start-end`, and no path here holds a colon.
  const named = new Set(mutate.map((entry) => entry.split(':')[0])).size;
  return found === null || Number(found[1]) < named;
}
