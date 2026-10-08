import { describe, it, expect } from 'vitest';
import { addDays } from '@/lib/date';
import { racePhaseOf } from './race-phase';

/**
 * `training-architecture/55`: the phase is the days from the session's date to
 * the Target Race, with 56 days (8 weeks) as the line (Mads, 2026-10-01).
 */
describe('racePhaseOf', () => {
  const day = '2026-10-10';

  it('is close from race day back to 55 days, early at 56 days, after the race and with no race', () => {
    expect(racePhaseOf(day, addDays(day, 55))).toBe('close');
    expect(racePhaseOf(day, day)).toBe('close');
    expect(racePhaseOf(day, addDays(day, 56))).toBe('early');
    expect(racePhaseOf(day, addDays(day, -1))).toBe('early');
    expect(racePhaseOf(day, null)).toBe('early');
  });

  it('reads the session date and the race date and nothing else', () => {
    expect(racePhaseOf.length).toBe(2);
  });
});
