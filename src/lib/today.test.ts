import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateKey, startOfToday, today } from './date';

/** The clock seam (frontend-quality/06): pinnable in tests, never in production. */
describe('today', () => {
  // A frozen clock, so `today()` and the `dateKey(new Date())` it is compared
  // against cannot straddle midnight (CodeRabbit, PR #72).
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00') });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('is the real date when nothing is pinned', () => {
    vi.stubEnv('COACH_TODAY', '');
    expect(today()).toBe(dateKey(new Date()));
  });

  it('is the pinned day outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('COACH_TODAY', '2026-09-16');
    expect(today()).toBe('2026-09-16');
  });

  it('ignores the pin in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COACH_TODAY', '2026-09-16');
    expect(today()).toBe(dateKey(new Date()));
  });

  it('ignores a pin that is not a real day', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('COACH_TODAY', '2026-02-30');
    expect(today()).toBe(dateKey(new Date()));
  });
});

/**
 * The same clock as a Date, for the seed's history builders (frontend-quality/09):
 * local midnight of `today()`, so a pinned day pins the seeded sessions too.
 */
describe('startOfToday', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00') });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('is local midnight of the real day when nothing is pinned', () => {
    vi.stubEnv('COACH_TODAY', '');
    expect(startOfToday().getTime()).toBe(new Date('2026-09-17T00:00:00').getTime());
  });

  it('is local midnight of the pinned day outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('COACH_TODAY', '2026-09-16');
    expect(startOfToday().getTime()).toBe(new Date('2026-09-16T00:00:00').getTime());
    expect(dateKey(startOfToday())).toBe(today());
  });
});
