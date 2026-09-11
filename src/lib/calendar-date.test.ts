import { describe, it, expect } from 'vitest';
import { isCalendarDate } from './calendar-date';

/**
 * `training-architecture/02`. This helper is the reason the Race Date is a field
 * rather than something guessed at, so it is tested directly rather than only
 * through the two callers that happen to use it.
 */
describe('isCalendarDate', () => {
  it('accepts a real day', () => {
    expect(isCalendarDate('2027-08-15')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true); // a leap year
  });

  it('rejects a day the calendar does not have', () => {
    // The case a regular expression cannot catch, and the reason this is not
    // one: `\d{4}-\d{2}-\d{2}` accepts every line below.
    expect(isCalendarDate('2027-02-30')).toBe(false);
    expect(isCalendarDate('2027-02-29')).toBe(false); // not a leap year
    expect(isCalendarDate('2027-13-01')).toBe(false);
    expect(isCalendarDate('2027-00-10')).toBe(false);
  });

  it('rejects the shapes the old heuristics used to read', () => {
    // Each of these was a date to one of `computePhase`'s four regexes.
    expect(isCalendarDate('August 2027')).toBe(false);
    expect(isCalendarDate('15/08/2027')).toBe(false);
    expect(isCalendarDate('2027')).toBe(false);
    expect(isCalendarDate('Ironman Copenhagen')).toBe(false);
  });

  it('rejects a non-string rather than throwing', () => {
    // It guards a server action's payload, where the declared type is erased,
    // so a hand-rolled request can send anything at all.
    //
    // The Symbol is the case the `typeof` guard actually earns its place on:
    // every other value here would still come back false without it, because
    // interpolating it produces something `Date` cannot parse. A Symbol throws
    // on interpolation instead — so without the guard this is a 500, not a
    // refusal.
    for (const value of [undefined, null, 42, {}, ['2027-08-15'], Symbol('2027-08-15')]) {
      expect(() => isCalendarDate(value)).not.toThrow();
      expect(isCalendarDate(value)).toBe(false);
    }
  });

  it('rejects a date that does not round-trip exactly', () => {
    // Both halves of the check matter: a parseable value whose canonical form
    // differs is not the day the athlete typed.
    expect(isCalendarDate('')).toBe(false);
    expect(isCalendarDate('2027-8-15')).toBe(false);
    expect(isCalendarDate('2027-08-15T00:00:00Z')).toBe(false);
  });
});
