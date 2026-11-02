import { describe, it, expect } from 'vitest';
import { hoursChangePreview, isStartFrom, keptWeekStale } from './hours-change';
import type { WeekDraft } from './week-draft';

// 2026-09-30 is a Wednesday in ISO week 40; next week (41) starts 10-05.
const TODAY = '2026-09-30';
const W41 = '2026-10-05';
const W42 = '2026-10-12';
const W48 = '2026-11-23';

const draft = (over: Partial<WeekDraft> = {}): WeekDraft => ({
  id: 'd41',
  weekStart: W41,
  visibleFrom: TODAY,
  sessions: [],
  citations: [],
  approved: false,
  createdAt: new Date('2026-09-28T08:00:00Z'),
  ...over,
});

describe('hoursChangePreview — what the hours dialog asks (showable-version/61)', () => {
  it('a waiting draft the athlete can see offers both weeks', () => {
    expect(hoursChangePreview({ today: TODAY, weeks: [W41, W42, W48], inFlightWeek: null, waiting: draft(), nextWeekPlanned: false })).toEqual({
      kind: 'choose',
      waitingWeek: W41,
      weeks: [W41, W42, W48],
      weeksIfKept: [W42, W48],
    });
  });

  it('a coach’s preview drops the waiting week; a draft in flight waits; otherwise a plain confirm naming an accepted week', () => {
    const base = { today: TODAY, weeks: [W42, W48], inFlightWeek: null, waiting: null, nextWeekPlanned: false };

    expect(hoursChangePreview({ ...base, weeks: [W41, W42], waiting: draft({ visibleFrom: '2026-10-01' }) })).toEqual({
      kind: 'coach-preparing',
      waitingWeek: W41,
      weeks: [W42],
    });
    // A draft being written is kept like one in a coach's preview: the change starts the week after it
    // (review of 61, Mads 2026-11-02), so a Coach that keeps failing never locks the athlete out.
    expect(hoursChangePreview({ ...base, weeks: [W41, W42, W48], inFlightWeek: W41 })).toEqual({ kind: 'drafting', week: W41, weeks: [W42, W48] });
    // This week's own first draft is not one an hours change can race.
    expect(hoursChangePreview({ ...base, inFlightWeek: '2026-09-28' })).toEqual({ kind: 'confirm', weeks: [W42, W48], plannedWeek: null });
    expect(hoursChangePreview({ ...base, nextWeekPlanned: true })).toEqual({ kind: 'confirm', weeks: [W42, W48], plannedWeek: W41 });
  });

  it('a draft visible from today is the athlete’s, not the coach’s preview', () => {
    expect(hoursChangePreview({ today: TODAY, weeks: [W41], inFlightWeek: null, waiting: draft({ visibleFrom: TODAY }), nextWeekPlanned: false }).kind).toBe('choose');
  });
});

describe('keptWeekStale', () => {
  const changed = (keptWeek: string | null) => ({ type: 'hours_changed', payload: { hours: 10, keptWeek } });
  const declined = (weekStart: string) => ({ type: 'week_plan_declined', payload: { weekStart } });

  it('is not stale with nothing recorded', () => {
    expect(keptWeekStale([], W41)).toBe(false);
  });

  it('ignores events of any other kind, even one naming the kept week', () => {
    expect(keptWeekStale([changed(W41), { type: 'week_draft_withdrawn', payload: { weekStart: W41 } }], W41)).toBe(true);
  });

  it('reads an event with no payload as naming no week', () => {
    expect(keptWeekStale([changed(W41), { type: 'week_plan_declined', payload: null }], W41)).toBe(true);
    expect(keptWeekStale([{ type: 'hours_changed', payload: null }], W41)).toBe(false);
  });

  it('the latest change decides; a decline of the kept week clears it', () => {
    expect(keptWeekStale([changed(W41), changed(null)], W41)).toBe(false);
    expect(keptWeekStale([changed(W41), declined(W42)], W41)).toBe(true);
    expect(keptWeekStale([changed(W41), declined(W41)], W41)).toBe(false);
  });
});

describe('isStartFrom', () => {
  it('knows the two starts the dialog offers and nothing else', () => {
    expect(isStartFrom('waiting-week')).toBe(true);
    expect(isStartFrom('week-after')).toBe(true);
    for (const x of ['now', '', null, undefined, 1]) expect(isStartFrom(x)).toBe(false);
  });
});
