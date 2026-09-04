import { describe, it, expect } from 'vitest';
import {
  canRestoreOnClear,
  canMarkUnavailable,
} from './displacement';

/**
 * `sessionsToPark` and `sessionsToRestore` used to live here and are gone. Which
 * rows park or restore is now decided by the `WHERE` of a single statement in
 * `unavailable-date.ts`, so that the read-then-write race they sat in the middle
 * of cannot happen; those rules are asserted as rendered SQL over there.
 *
 * What stayed is the half that never looked at a row: the two date boundaries.
 */
describe('canRestoreOnClear — the boundary for restoring on a clear', () => {
  const TODAY = '2026-07-16';

  it('restores on a future day', () => {
    expect(canRestoreOnClear('2026-07-18', TODAY)).toBe(true);
  });

  it('restores on the current day', () => {
    expect(canRestoreOnClear(TODAY, TODAY)).toBe(true);
  });

  it('restores nothing on a past day — the unavailability is history (ADR 0002)', () => {
    expect(canRestoreOnClear('2026-07-14', TODAY)).toBe(false);
  });

  it('restores nothing on a past day even earlier in the same week', () => {
    // today is Thursday; the cleared day is Tuesday of the same week — still past.
    expect(canRestoreOnClear('2026-07-14', '2026-07-16')).toBe(false);
  });
});

describe('canMarkUnavailable — the boundary for marking a date', () => {
  const TODAY = '2026-07-16';

  it('allows today and future days', () => {
    expect(canMarkUnavailable(TODAY, TODAY)).toBe(true);
    expect(canMarkUnavailable('2026-07-20', TODAY)).toBe(true);
  });

  it('refuses a past day — nothing is scheduled into the past', () => {
    expect(canMarkUnavailable('2026-07-15', TODAY)).toBe(false);
  });
});
