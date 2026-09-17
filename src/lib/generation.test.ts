import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COACH_EXPECTED_SECONDS, GENERATION_POLL_LIMIT_MS, GENERATION_POLL_MS, startGenerationPoll } from './generation';

/** The generating state's numbers and its poll (`training-architecture/29`). */
describe('generation constants', () => {
  it('the estimate and the poll are the numbers from the 2026-09-17 triage — tune them here, in one place', () => {
    expect(COACH_EXPECTED_SECONDS).toBe(30);
    expect(GENERATION_POLL_MS).toBe(10_000);
    expect(GENERATION_POLL_LIMIT_MS).toBe(120_000);
  });
});

describe('startGenerationPoll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls refresh every interval until the limit, then onGiveUp once and nothing more', () => {
    const refresh = vi.fn();
    const onGiveUp = vi.fn();
    startGenerationPoll(refresh, onGiveUp, { intervalMs: 10_000, limitMs: 30_000 });
    vi.advanceTimersByTime(9_999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('the returned stop cancels the next tick, so an unmounted card refreshes nothing', () => {
    const refresh = vi.fn();
    const onGiveUp = vi.fn();
    const stop = startGenerationPoll(refresh, onGiveUp, { intervalMs: 10_000, limitMs: 30_000 });
    vi.advanceTimersByTime(10_000);
    stop();
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('the last tick inside the limit still refreshes before giving up', () => {
    const refresh = vi.fn();
    const onGiveUp = vi.fn();
    startGenerationPoll(refresh, onGiveUp, { intervalMs: 10_000, limitMs: 10_000 });
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });
});
