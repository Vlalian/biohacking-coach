import { describe, it, expect } from 'vitest';
import { filesMatching, SWEEP_TIMEOUT_MS } from '@/test/source-sweep';

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
  it('keeps no month-name lookup table anywhere in src/', () => {
    // The distinctive artifact of parsing a date out of prose, and the one piece
    // of the old heuristic that cannot be written any other way: to turn
    // "August 2026" into a date you need a table mapping month names to numbers.
    // Three spelled-out consecutive months in one file is that table and very
    // little else.
    expect(filesMatching(/january[\s\S]*february[\s\S]*march/i, { self: import.meta.url })).toEqual([]);
  }, SWEEP_TIMEOUT_MS);

  it('has no computePhase, and no training_phase column, left to read', () => {
    // `training-architecture/03`'s acceptance criterion, as a search rather than
    // an inspection. Both names are distinctive enough that a survivor is a real
    // survivor rather than a coincidence.
    expect(filesMatching(/computePhase|trainingPhase|training_phase/, { self: import.meta.url })).toEqual([]);
  }, SWEEP_TIMEOUT_MS);
});
