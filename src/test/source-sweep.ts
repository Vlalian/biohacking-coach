import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';

/**
 * One cached walk of `src/`, for the guards that assert something about the
 * whole codebase rather than about one module ("no month-name table anywhere",
 * "nothing calls a Session Chip a block", "this store has exactly these
 * readers").
 *
 * Five such tests each walked and re-read every file themselves, so one run did
 * the same I/O ten times over; under the `/onkel` gate's coverage pass on a
 * busy machine that crossed Vitest's five-second default and the gate died
 * reporting a timeout rather than a verdict. The walk happens once per process
 * and each file's source is memoised, stripped and raw.
 *
 * Resolved from this file, never from `process.cwd()`: the mutation gate runs
 * the suite from a sandbox copy with a different working directory, where a
 * cwd-relative path silently finds nothing and the assertions pass while
 * proving nothing.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

/**
 * What a sweeping test is given instead of Vitest's five-second default.
 *
 * Reading every file in `src/` is seconds of I/O, and under the `/onkel`
 * gate's coverage instrumentation it is several — enough that the gate used to
 * die reporting a timeout rather than a verdict. The cache below means a file
 * is read once per process; this is the allowance for that one read.
 */
export const SWEEP_TIMEOUT_MS = 30_000;

let cachedFiles: string[] | null = null;
const cachedCode = new Map<string, string>();
const cachedRaw = new Map<string, string>();

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

export interface SweepOptions {
  /**
   * The calling guard's own `import.meta.url`, excluded from the sweep — a
   * guard necessarily names what it looks for.
   */
  self?: string;
  /**
   * Tests are swept by default: a rename that survives in a test name or a
   * comment has not been done. Pass `false` for a guard about production
   * callers, where a test that exercises the seam is not a violation.
   */
  includeTests?: boolean;
}

/** Absolute paths of every `.ts`/`.tsx` file under `src/`, walked once. */
export function sourceFiles(includeTests = true): string[] {
  cachedFiles ??= walk(SRC);
  if (includeTests) return cachedFiles;
  // Stryker disable next-line Regex — the survivor here is the anchor: a name ending in `.test.ts` has nothing after it to match, so `$` is unobservable while the rest of the pattern is pinned by the assertions on both extensions.
  return cachedFiles.filter((f) => !/\.test\.tsx?$/.test(f));
}

/**
 * A file's source with comments removed.
 *
 * Without this a guard flags the prose that *explains* a removal — a schema
 * comment saying there is no stored phase, a test's own header. Those are the
 * record of why the code looks the way it does, and a guard that forces them
 * to be deleted is a guard that makes the codebase worse.
 */
export function codeOf(file: string): string {
  const cached = cachedCode.get(file);
  // Stryker disable next-line ConditionalExpression — a memoised value equals the recomputed one by construction; only the clock can tell them apart, and this cache exists because the clock could.
  if (cached !== undefined) return cached;
  const source = readFileSync(file, 'utf8');
  // A space, not nothing: a block comment can sit between two tokens, and
  // joining them would invent an identifier no guard should match.
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Stryker disable next-line StringLiteral — a line comment runs to the newline, so whatever replaces it can only be trailing whitespace; no sweep can see the difference.
  const stripped = withoutBlocks.replace(/\/\/.*/g, ' ');
  // Stryker disable next-line CallExpression — dropping the write only makes the sweep slow again, which no assertion can see.
  cachedCode.set(file, stripped);
  return stripped;
}

/** A file's source as written, comments included. Cached like `codeOf`. */
export function rawOf(file: string): string {
  const cached = cachedRaw.get(file);
  // Stryker disable next-line ConditionalExpression — as in `codeOf`: the cached string is the same string.
  if (cached !== undefined) return cached;
  const source = readFileSync(file, 'utf8');
  // Stryker disable next-line CallExpression — as in `codeOf`: speed only.
  cachedRaw.set(file, source);
  return source;
}

/** An absolute path from a `src/`-relative one, for reading a named file. */
export function srcPath(relative: string): string {
  return join(SRC, ...relative.split('/'));
}

/** `src/`-relative path, with forward slashes on every platform. */
export function relativeToSrc(file: string): string {
  return file.slice(SRC.length).split(sep).join('/');
}

/** `src/`-relative paths of every file whose *code* matches, sorted. */
export function filesMatching(pattern: RegExp, options: SweepOptions = {}): string[] {
  return sweep(pattern, options, codeOf);
}

/**
 * The same, over the source as written — for a guard whose subject is the
 * prose too (a rename that must not survive in a comment or a test name).
 */
export function filesMatchingRaw(pattern: RegExp, options: SweepOptions = {}): string[] {
  return sweep(pattern, options, rawOf);
}

function sweep(pattern: RegExp, options: SweepOptions, read: (file: string) => string): string[] {
  const own = options.self === undefined ? null : fileURLToPath(options.self);
  // `sourceFiles` owns the default; repeating it here would be a second place
  // for "tests are swept unless asked otherwise" to be true or false.
  const hits = sourceFiles(options.includeTests)
    .filter((file) => file !== own && pattern.test(read(file)))
    .map(relativeToSrc);
  // Stryker disable next-line MethodExpression — the guards assert exact lists, so the order must be ours and not the filesystem's; this one already walks in sorted order, which is why dropping the sort changes nothing here and everything on a filesystem that does not.
  return hits.sort();
}
