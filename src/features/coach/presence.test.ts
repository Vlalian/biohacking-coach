import { describe, it, expect } from 'vitest';
import { BUILDING_AT, FULL_AT, presenceStage, reflectionWeeksOf } from './presence';

/**
 * The Presence Arc, re-keyed on data (CONTEXT.md, 2026-09-16): the stage is
 * what the Coach actually has, not how many Weekly Sessions were held. The two
 * thresholds are the first guess Mads marked provisional; they are pinned here
 * so a retune is a deliberate edit of a constant, not a drift.
 */
describe('presenceStage', () => {
  it('pins the first-guess thresholds: building at 1, full at 3', () => {
    expect(BUILDING_AT).toBe(1);
    expect(FULL_AT).toBe(3);
  });

  it('stays cold start with no reflections and no check-ins, however many days pass', () => {
    // Time is not an input at all: an athlete who never talks never drifts
    // into false familiarity. The absence of a clock parameter is the test.
    expect(presenceStage.length).toBe(2);
    expect(presenceStage(0, 0)).toBe('cold_start');
  });

  it('crosses into building on the first week of reflections OR the first check-in', () => {
    expect(presenceStage(BUILDING_AT, 0)).toBe('building');
    expect(presenceStage(0, BUILDING_AT)).toBe('building');
  });

  it('is full presence once either count reaches the full threshold', () => {
    expect(presenceStage(FULL_AT, 0)).toBe('full');
    expect(presenceStage(0, FULL_AT)).toBe('full');
    expect(presenceStage(FULL_AT - 1, FULL_AT - 1)).toBe('building');
  });

  it('reads the two counts as weeks of evidence, not as a sum', () => {
    // A week with both a reflection and a check-in is one week of knowing the
    // athlete, not two — the larger count is the depth, never the total.
    expect(presenceStage(1, 1)).toBe('building');
    expect(presenceStage(2, 1)).toBe('building');
  });
});

describe('reflectionWeeksOf', () => {
  it('counts distinct weeks, not rated sessions', () => {
    // Three ratings in one week are one week of knowing the athlete.
    expect(reflectionWeeksOf(['2026-09-14', '2026-09-16', '2026-09-20'])).toBe(1);
    expect(reflectionWeeksOf(['2026-09-14', '2026-09-21'])).toBe(2);
    expect(reflectionWeeksOf([])).toBe(0);
  });
});
