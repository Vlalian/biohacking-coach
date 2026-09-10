import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';

/**
 * Two guarantees that outlived the code they were written about, kept together
 * because they are the same promise seen from two sides.
 *
 * **`training-architecture/02`: no regex parses a date out of a race name.**
 * `computePhase` used to run four heuristics over whatever the athlete typed as
 * their race — an ISO date, "Month YYYY" against a month-name table,
 * `dd/mm/yyyy`, and a bare four-digit year *assumed to be mid-June* — falling
 * silently through to `Base Building` when none matched.
 *
 * **`training-architecture/03`: the Training Phase is not stored.** That same
 * function then wrote its guess to a column nothing ever recomputed, so an
 * athlete who onboarded eleven months out was still `Base Building` in race
 * week and every Coach prompt read that string as fact. The phase is now the
 * name of the Training Block today falls inside, derived on every read.
 *
 * Both are asserted structurally — the *capability* is gone, not merely unused.
 * A blanket "no regex anywhere near a race" check was tried first and thrown
 * away: it matched twenty files on JSX and ordinary division, and a guard that
 * needs a twenty-file allowlist proves nothing about the twenty-first.
 */
describe('the horizon is a field, and the phase is derived from it', () => {
  // Resolved from this file, never from `process.cwd()`: the mutation gate runs
  // the suite from a sandbox copy with a different working directory, where a
  // cwd-relative path silently finds nothing and the assertions below pass
  // while proving nothing.
  const SRC = fileURLToPath(new URL('../..', import.meta.url));

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      if (!/\.tsx?$/.test(entry.name)) return [];
      // This file is the one exclusion: it necessarily names the things it is
      // looking for.
      return entry.name === 'no-date-guessing.test.ts' ? [] : [full];
    });
  }

  /**
   * The file's source with comments removed.
   *
   * Without this the guard flags the prose that *explains* the removal — the
   * schema comment saying there is no stored phase, this file's own header, the
   * doc on `trainingBlocks` describing what it replaced. Those are the record of
   * why the code looks the way it does, and a guard that forces them to be
   * deleted is a guard that makes the codebase worse.
   */
  function code(file: string): string {
    return readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*/g, ' ');
  }

  /** Repo-relative paths of every file whose *code* matches. */
  function filesMatching(pattern: RegExp): string[] {
    return sourceFiles(SRC)
      .filter((file) => pattern.test(code(file)))
      .map((file) => file.slice(SRC.length).split(sep).join('/'))
      .sort();
  }

  it('keeps no month-name lookup table anywhere in src/', () => {
    // The distinctive artifact of parsing a date out of prose, and the one piece
    // of the old heuristic that cannot be written any other way: to turn
    // "August 2026" into a date you need a table mapping month names to numbers.
    // Three spelled-out consecutive months in one file is that table and very
    // little else.
    expect(filesMatching(/january[\s\S]*february[\s\S]*march/i)).toEqual([]);
  });

  it('has no computePhase, and no training_phase column, left to read', () => {
    // `training-architecture/03`'s acceptance criterion, as a search rather than
    // an inspection. Both names are distinctive enough that a survivor is a real
    // survivor rather than a coincidence.
    expect(filesMatching(/computePhase|trainingPhase|training_phase/)).toEqual([]);
  });
});
