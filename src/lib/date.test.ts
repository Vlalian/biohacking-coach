import { describe, it, expect } from 'vitest';
import { isValidDateKey, weekStartOf, addDays } from './date';

describe('isValidDateKey', () => {
  it('accepts a canonical real day', () => {
    expect(isValidDateKey('2026-07-20')).toBe(true);
  });

  it('rejects non-canonical or impossible dates', () => {
    for (const bad of ['2026-7-5', '2026-07-5', '2026-02-30', '2026-13-01', 'nope', '', '2026-07-20 ']) {
      expect(isValidDateKey(bad), bad).toBe(false);
    }
  });
});

describe('weekStartOf / addDays', () => {
  it('weekStartOf returns the Monday of the week', () => {
    expect(weekStartOf('2026-07-20')).toBe('2026-07-20'); // a Monday
    expect(weekStartOf('2026-07-26')).toBe('2026-07-20'); // the Sunday
    expect(weekStartOf('2026-07-19')).toBe('2026-07-13'); // previous Sunday
  });

  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });
});
