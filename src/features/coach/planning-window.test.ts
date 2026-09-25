import { describe, expect, it } from 'vitest';
import { planningWindow } from './planning-window';

// 2026-08-19 is a Wednesday; its week runs Mon 2026-08-17 – Sun 2026-08-23.
const WEDNESDAY = '2026-08-19';
const SATURDAY = '2026-08-22';
const SUNDAY = '2026-08-23';

describe('planningWindow', () => {
  it('runs from today to the end of the current week', () => {
    expect(planningWindow(WEDNESDAY)).toEqual({
      start: '2026-08-19',
      end: '2026-08-23',
      fellThrough: false,
      excludedDates: [],
    });
  });

  // The three-day floor was offered and declined (Mads, 2026-09-02): a thin
  // first week beats an unexplained empty one, even at its worst.
  it('is one day long on the last day of the week, with no floor', () => {
    expect(planningWindow(SUNDAY)).toEqual({
      start: '2026-08-23',
      end: '2026-08-23',
      fellThrough: false,
      excludedDates: [],
    });
  });

  it('falls through to next week when every remaining day is a Fixed Constraint', () => {
    expect(planningWindow(SATURDAY, ['Saturday', 'Sunday'])).toEqual({
      start: '2026-08-24',
      end: '2026-08-30',
      fellThrough: true,
      excludedDates: ['2026-08-29', '2026-08-30'],
    });
  });

  it('falls through on a Sunday signup only when the Sunday itself is constrained', () => {
    expect(planningWindow(SUNDAY, ['Monday'])).toMatchObject({
      start: SUNDAY,
      fellThrough: false,
    });
    expect(planningWindow(SUNDAY, ['Sunday'])).toMatchObject({
      start: '2026-08-24',
      fellThrough: true,
    });
  });

  it('treats an Unavailable Date as unplannable, the same as a Fixed Constraint', () => {
    expect(planningWindow(SATURDAY, [], ['2026-08-22', '2026-08-23'])).toEqual({
      start: '2026-08-24',
      end: '2026-08-30',
      fellThrough: true,
      // Both marked days were in the week this window gave up on, so the week
      // it landed on has nothing ruled out.
      excludedDates: [],
    });
  });

  it('combines the two: a week emptied by one of each falls through', () => {
    expect(planningWindow(SATURDAY, ['Saturday'], ['2026-08-23'])).toMatchObject({
      fellThrough: true,
    });
  });
});

/**
 * The day-level exclusions (CodeRabbit on PR #57, 2026-09-09).
 *
 * The window used these to decide *which weeks* it covered and then dropped
 * them, so `validateProposedPlan` accepted any real date inside the range. The
 * only thing keeping the Coach off a day the athlete had ruled out was the
 * `NO TRAINING ON:` line in the prompt — and `showable-version/11` is the
 * ticket that established a prompt line is a request, not a bound. This is the
 * same argument one level down: the window bounds which weeks, and now also
 * which days inside them.
 *
 * Both kinds resolve to concrete date keys here, so nothing downstream has to
 * know that a Fixed Constraint is a weekday name and an Unavailable Date is a
 * day.
 */
describe('planningWindow — the days ruled out inside it', () => {
  it('resolves a Fixed Constraint weekday to the dates it covers', () => {
    // Wednesday 19th; the window runs to Sunday 23rd, so 'Saturday' is the 22nd.
    expect(planningWindow(WEDNESDAY, ['Saturday']).excludedDates).toEqual(['2026-08-22']);
  });

  it('carries an Unavailable Date that falls inside the window', () => {
    expect(planningWindow(WEDNESDAY, [], ['2026-08-21']).excludedDates).toEqual(['2026-08-21']);
  });

  it('ignores an Unavailable Date outside the window', () => {
    // Before the start and after the end: neither is this window's business.
    expect(
      planningWindow(WEDNESDAY, [], ['2026-08-17', '2026-08-30']).excludedDates,
    ).toEqual([]);
  });

  it('merges both kinds without repeating a day that is ruled out twice', () => {
    // Saturday the 22nd is both a Fixed Constraint and marked unavailable.
    expect(
      planningWindow(WEDNESDAY, ['Saturday'], ['2026-08-21', '2026-08-22']).excludedDates,
    ).toEqual(['2026-08-21', '2026-08-22']);
  });

  it('describes the fallen-through week, not the one it gave up on', () => {
    // Every remaining day of this week is off, so the window is next week — and
    // the exclusions it reports must be next week's, or a caller would refuse
    // days using a list belonging to a week nobody is planning.
    const w = planningWindow(SATURDAY, ['Saturday', 'Sunday']);
    expect(w.fellThrough).toBe(true);
    expect(w.excludedDates).toEqual(['2026-08-29', '2026-08-30']);
  });
});

describe('the athlete’s chosen first day (training-architecture/36)', () => {
  it('opens the window on the chosen day, and falls through to its week when it is past this one', () => {
    // Mads ruled 2026-09-23: no session lands before the chosen day, from
    // anyone. So the bound is here and not only on the block arithmetic — this
    // is the one place the rule lives, and the Coach's draft derives its write
    // range from it. That reopens the 2026-09-02 "rest of this week" start;
    // the no-floor rule and the fall-through are untouched.
    expect(planningWindow('2026-10-07', [], [], '2026-10-09').start).toBe('2026-10-09');
    expect(planningWindow('2026-10-07', [], [], '2026-10-09').end).toBe('2026-10-11');

    // Next Monday: nothing of this week is theirs to plan.
    const next = planningWindow('2026-10-07', [], [], '2026-10-12');
    expect(next.start).toBe('2026-10-12');
    expect(next.end).toBe('2026-10-18');
  });

  it('leaves the rule exactly as it was with no choice, or one already past', () => {
    expect(planningWindow('2026-10-07', [], []).start).toBe('2026-10-07');
    expect(planningWindow('2026-10-07', [], [], '2026-10-01').start).toBe('2026-10-07');
    expect(planningWindow('2026-10-07', [], [], '2026-10-07').start).toBe('2026-10-07');
  });

  it('still falls through when every day from the chosen one is ruled out', () => {
    // The chosen day is Friday and Friday–Sunday are all excluded: there is no
    // remainder to plan, so the window is next week, as it always was.
    const w = planningWindow('2026-10-07', ['Friday', 'Saturday', 'Sunday'], [], '2026-10-09');
    expect(w.fellThrough).toBe(true);
    expect(w.start).toBe('2026-10-12');
  });
});
