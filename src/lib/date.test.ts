import { describe, it, expect } from 'vitest';
import { isValidDateKey, weekStartOf, addDays, formatFullDate, daysBetween, isoWeekNumber } from './date';

describe('isoWeekNumber', () => {
  it('numbers a Monday by the ISO week it starts, decided by its Thursday', () => {
    expect(isoWeekNumber('2026-09-21')).toBe(39);
    // The year boundary is where week numbers go wrong: these Mondays belong
    // to week 1 of the *next* year, and the last one to a 53-week year.
    expect(isoWeekNumber('2025-12-29')).toBe(1);
    expect(isoWeekNumber('2024-12-30')).toBe(1);
    expect(isoWeekNumber('2020-12-28')).toBe(53);
  });
});

describe('isValidDateKey', () => {
  it('accepts a canonical real day', () => {
    expect(isValidDateKey('2026-07-20')).toBe(true);
  });

  it('rejects non-canonical or impossible dates', () => {
    for (const bad of ['2026-7-5', '2026-07-5', '2026-02-30', '2026-13-01', 'nope', '', '2026-07-20 ']) {
      expect(isValidDateKey(bad), bad).toBe(false);
    }
  });

  it('rejects a shape Date would happily parse but the column would not store', () => {
    // These round-trip through `new Date` and back unchanged, so only the
    // shape check refuses them — a five-digit year, an extra digit, a sign.
    for (const bad of ['12026-07-20', '2026-007-20', '2026-07-200', '+2026-07-20']) {
      expect(isValidDateKey(bad), bad).toBe(false);
    }
  });
});

describe('formatFullDate', () => {
  it('formats a key as a full localised date, in the given language', () => {
    expect(formatFullDate('2026-07-15', 'en-GB')).toBe('Wednesday 15 July');
    expect(formatFullDate('2026-07-15', 'da')).toBe('onsdag 15. juli');
  });

  it('keeps the calendar day west of Greenwich', () => {
    // A key is a day, not an instant. Formatted in UTC it is the 15th
    // everywhere; formatted in local time it would be the 14th in Honolulu.
    const local = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Pacific/Honolulu',
    }).format(new Date('2026-07-15T00:00:00Z'));
    expect(local).toBe('Tuesday 14 July');
    expect(formatFullDate('2026-07-15', 'en-GB')).toBe('Wednesday 15 July');
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

describe('daysBetween — whole days from one key to another', () => {
  it('counts forward, backward and zero, ignoring DST', () => {
    expect(daysBetween('2026-09-22', '2026-09-23')).toBe(1);
    expect(daysBetween('2026-09-22', '2026-12-20')).toBe(89);
    expect(daysBetween('2026-09-23', '2026-09-22')).toBe(-1);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-09-22', '2026-09-22')).toBe(0);
  });
});
