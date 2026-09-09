import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import { computePhase } from '@/features/onboarding/onboarding-flow';

/**
 * `training-architecture/02`: **no regex parses a date out of a race name.**
 *
 * `computePhase` used to run four heuristics over whatever the athlete typed as
 * their race — an ISO date, "Month YYYY" against a month-name table,
 * `dd/mm/yyyy`, and a bare four-digit year *assumed to be mid-June* — and fell
 * silently through to `Base Building` when none matched. An athlete who typed a
 * race with no year got a wrong Training Phase permanently, and nothing anywhere
 * recorded that the parse had failed.
 *
 * Two guards, because the criterion has two halves. One is behavioural: a race
 * name is no longer something this function can read. The other is structural:
 * the month-name table that made "August 2026" readable is gone, and cannot come
 * back unnoticed.
 *
 * A blanket "no regex anywhere near a race" check was tried first and thrown
 * away: it matched twenty files on JSX and ordinary division, and a guard that
 * needs a twenty-file allowlist proves nothing about the twenty-first.
 */
describe('no date is derived from a race name', () => {
  it('cannot read a race name at all, and fails loudly rather than guessing', () => {
    // The old signature took this string and returned 'Taper'. It now takes a
    // Date, so a name is a type error at build time and a thrown error at
    // runtime. Loud is the point: the defect being fixed was a *silent*
    // fallback, which is why this asserts a throw rather than a default.
    expect(() =>
      computePhase('Ironman Copenhagen, August 2026' as unknown as Date, new Date(2026, 6, 24)),
    ).toThrow();
  });

  // Resolved from this file, never from `process.cwd()`: the mutation gate runs
  // the suite from a sandbox copy with a different working directory, where a
  // cwd-relative path silently finds nothing and the assertion below passes
  // while proving nothing.
  const SRC = fileURLToPath(new URL('../..', import.meta.url));

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      if (!/\.tsx?$/.test(entry.name)) return [];
      // This file is the one exclusion: it necessarily names the months it is
      // looking for.
      return entry.name === 'no-date-guessing.test.ts' ? [] : [full];
    });
  }

  it('keeps no month-name lookup table anywhere in src/', () => {
    // The distinctive artifact of parsing a date out of prose, and the one piece
    // of the old heuristic that cannot be written any other way: to turn
    // "August 2026" into a date you need a table mapping month names to numbers.
    // Two spelled-out consecutive months in one file is that table and very
    // little else.
    const withMonthTable = sourceFiles(SRC)
      .filter((file) => {
        const source = readFileSync(file, 'utf8').toLowerCase();
        return (
          source.includes('january') && source.includes('february') && source.includes('march')
        );
      })
      .map((file) => file.slice(SRC.length).split(sep).join('/'))
      .sort();

    expect(withMonthTable).toEqual([]);
  });
});
