import { describe, it, expect } from 'vitest';
import { raceDaysByDate } from './race-days';

/**
 * `training-architecture/37` — which days of the calendar carry a race, and
 * what kind. A Tune-up Race is derived, never stored: a non-target race before
 * the target (`races.ts`, CONTEXT.md).
 */
const TARGET = { date: '2027-08-15', name: 'IM Kbh', distance: 'Full', isTarget: true };
const TUNE = { date: '2027-02-27', name: 'Aarhus 70.3', distance: 'Half', isTarget: false };
const AFTER = { date: '2027-10-01', name: 'Late Sprint', distance: 'Sprint', isTarget: false };

describe('raceDaysByDate', () => {
  it('keys each race by its date, the target as target and an earlier race as a tune-up', () => {
    const days = raceDaysByDate([TUNE, TARGET]);
    expect(days.get('2027-08-15')).toEqual([{ ...TARGET, kind: 'target' }]);
    expect(days.get('2027-02-27')).toEqual([{ ...TUNE, kind: 'tune-up' }]);
    expect(days.size).toBe(2);
  });

  it('calls a race after the target, or any race with no target at all, just a race', () => {
    expect(raceDaysByDate([TARGET, AFTER]).get('2027-10-01')).toEqual([{ ...AFTER, kind: 'other' }]);
    expect(raceDaysByDate([TUNE]).get('2027-02-27')).toEqual([{ ...TUNE, kind: 'other' }]);
  });

  it('a race on the target\'s own day is not a tune-up for it', () => {
    const sameDay = { ...TUNE, date: TARGET.date };
    expect(raceDaysByDate([TARGET, sameDay]).get(TARGET.date)).toEqual([
      { ...TARGET, kind: 'target' },
      { ...sameDay, kind: 'other' },
    ]);
  });

  it('is empty with no races', () => {
    expect(raceDaysByDate([]).size).toBe(0);
  });
});
