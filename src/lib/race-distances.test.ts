import { describe, it, expect } from 'vitest';
import { RACE_DISTANCES, toRaceDistance } from './race-distances';

/**
 * The narrowing at the seam between a stored `distance` column and the closed
 * set the per-distance bands compare against (`training-architecture/34`).
 */
describe('toRaceDistance', () => {
  it('returns each stored distance the app knows, unchanged', () => {
    for (const distance of RACE_DISTANCES) {
      expect(toRaceDistance(distance)).toBe(distance);
    }
  });

  it('reads anything else as no distance at all, rather than guessing one', () => {
    // A band that guessed here would plan someone's week off a distance nobody
    // chose. "Other" is deliberately not in the set (see the module doc).
    expect(toRaceDistance('Duathlon')).toBeNull();
    expect(toRaceDistance('')).toBeNull();
    expect(toRaceDistance('olympic')).toBeNull(); // the set is case-sensitive
    expect(toRaceDistance(null)).toBeNull();
    expect(toRaceDistance(undefined)).toBeNull();
  });
});
