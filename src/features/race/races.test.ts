import { describe, it, expect } from 'vitest';
import type { RaceRow } from '@/db/schema';
import {
  TUNE_UP_EVE_EASY,
  inTuneUpWindow,
  racesEnteredAfterPlan,
  tuneUpRaces,
  tuneUpWindow,
} from './races';

/**
 * `training-architecture/09` — races beyond the first.
 *
 * Pure: every function takes dates and rows and returns dates and rows. The
 * repository decides what exists; this decides what it means for the plan.
 */
const TODAY = '2026-09-11';

function race(overrides: Partial<RaceRow> = {}): RaceRow {
  return {
    id: 'race_1',
    athleteId: 'athlete_1',
    name: 'Ironman Copenhagen',
    date: '2027-08-15',
    distance: 'Full',
    isTarget: true,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  };
}

describe('tuneUpRaces — the non-target races before the target', () => {
  const target = race();

  it('returns the non-target races dated after today and before the target, earliest first', () => {
    const later = race({ id: 'r3', name: 'Half Aarhus', date: '2027-05-01', distance: 'Half', isTarget: false });
    const sooner = race({ id: 'r2', name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic', isTarget: false });
    expect(tuneUpRaces(TODAY, [target, later, sooner], target).map((r) => r.id)).toEqual(['r2', 'r3']);
  });

  it('leaves out the target, races already run, and races after the target', () => {
    const past = race({ id: 'past', date: '2026-05-01', isTarget: false });
    const afterTarget = race({ id: 'after', date: '2027-10-01', isTarget: false });
    expect(tuneUpRaces(TODAY, [target, past, afterTarget], target)).toEqual([]);
  });

  it('is strict at both ends: a race today is not ahead, and one on race day is not before it', () => {
    const today = race({ id: 'today', date: TODAY, isTarget: false });
    const raceDay = race({ id: 'raceday', date: target.date, isTarget: false });
    const tomorrow = race({ id: 'tomorrow', date: '2026-09-12', isTarget: false });
    expect(tuneUpRaces(TODAY, [today, raceDay, tomorrow], target).map((r) => r.id)).toEqual(['tomorrow']);
  });

  it('returns nothing when there is no target — a race with nothing to tune up for is just a race', () => {
    const lone = race({ id: 'r2', date: '2027-03-01', isTarget: false });
    expect(tuneUpRaces(TODAY, [lone], null)).toEqual([]);
  });
});

describe('racesEnteredAfterPlan — the middle case', () => {
  const planWrittenAt = new Date('2026-09-07T08:00:00Z');
  const target = race();

  it('returns the races created after the plan was written, never the target', () => {
    const late = race({ id: 'late', date: '2026-09-27', isTarget: false, createdAt: new Date('2026-09-09T12:00:00Z') });
    const early = race({ id: 'early', date: '2027-03-01', isTarget: false, createdAt: new Date('2026-09-01T12:00:00Z') });
    const newTarget = race({ id: 't2', isTarget: true, createdAt: new Date('2026-09-10T12:00:00Z') });
    expect(racesEnteredAfterPlan([late, early, newTarget], newTarget, planWrittenAt).map((r) => r.id)).toEqual(['late']);
  });

  it('returns nothing when no plan has been written — there is nothing to be late for', () => {
    const late = race({ id: 'late', isTarget: false, createdAt: new Date('2026-09-09T12:00:00Z') });
    expect(racesEnteredAfterPlan([late], target, null)).toEqual([]);
  });

  it('compares instants, not days — a race entered the same day but after the plan is late', () => {
    const sameDay = race({ id: 'same', isTarget: false, createdAt: new Date('2026-09-07T09:00:00Z') });
    expect(racesEnteredAfterPlan([sameDay], target, planWrittenAt).map((r) => r.id)).toEqual(['same']);
  });

  it('a race entered at the very instant the plan was written is not late', () => {
    const tie = race({ id: 'tie', isTarget: false, createdAt: new Date(planWrittenAt) });
    expect(racesEnteredAfterPlan([tie], target, planWrittenAt)).toEqual([]);
  });

  it('with no target, every late race counts — there is no target to exempt', () => {
    const late = race({ id: 'late', isTarget: false, createdAt: new Date('2026-09-09T12:00:00Z') });
    expect(racesEnteredAfterPlan([late], null, planWrittenAt).map((r) => r.id)).toEqual(['late']);
  });
});

describe('tuneUpWindow — 30–60 % of the way in', () => {
  it('spans 30 % to 60 % of the days from the horizon start to race day', () => {
    // 100 days, so the arithmetic is legible: day 30 to day 60.
    expect(tuneUpWindow('2027-01-01', '2027-04-11')).toEqual({ from: '2027-01-31', to: '2027-03-02' });
  });

  it('is null under twelve weeks — too short a build to place a rehearsal in', () => {
    expect(tuneUpWindow('2027-01-01', '2027-03-20')).toBeNull();
    expect(tuneUpWindow('2027-01-01', '2027-03-26')).not.toBeNull();
  });

  it('is measured from when the race was entered, not from today, so it does not slide', () => {
    const a = tuneUpWindow('2027-01-01', '2027-07-01');
    expect(a).toEqual(tuneUpWindow('2027-01-01', '2027-07-01'));
    expect(a?.from).toBe('2027-02-24');
  });
});

describe('inTuneUpWindow — the only weeks the Coach may bring it up', () => {
  const window = { from: '2027-01-31', to: '2027-03-02' };

  it('is true inside the window, inclusive at both ends', () => {
    expect(inTuneUpWindow('2027-01-31', window)).toBe(true);
    expect(inTuneUpWindow('2027-02-14', window)).toBe(true);
    expect(inTuneUpWindow('2027-03-02', window)).toBe(true);
  });

  it('is false the day before it opens and the day after it closes', () => {
    expect(inTuneUpWindow('2027-01-30', window)).toBe(false);
    expect(inTuneUpWindow('2027-03-03', window)).toBe(false);
  });

  it('is false with no window at all', () => {
    expect(inTuneUpWindow('2027-02-14', null)).toBe(false);
  });
});

describe('TUNE_UP_EVE_EASY — the Head Coach interview option', () => {
  it('defaults to off: a tune-up is an ordinary training day until the interview says otherwise', () => {
    expect(TUNE_UP_EVE_EASY).toBe(false);
  });
});
