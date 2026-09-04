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
    });
  });

  // The three-day floor was offered and declined (Mads, 2026-09-02): a thin
  // first week beats an unexplained empty one, even at its worst.
  it('is one day long on the last day of the week, with no floor', () => {
    expect(planningWindow(SUNDAY)).toEqual({
      start: '2026-08-23',
      end: '2026-08-23',
      fellThrough: false,
    });
  });

  it('falls through to next week when every remaining day is a Fixed Constraint', () => {
    expect(planningWindow(SATURDAY, ['Saturday', 'Sunday'])).toEqual({
      start: '2026-08-24',
      end: '2026-08-30',
      fellThrough: true,
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
    });
  });

  it('combines the two: a week emptied by one of each falls through', () => {
    expect(planningWindow(SATURDAY, ['Saturday'], ['2026-08-23'])).toMatchObject({
      fellThrough: true,
    });
  });
});
