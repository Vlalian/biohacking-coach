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

  // The tick asks whether the result has landed; false means keep waiting.
  const waiting = () => vi.fn(async () => false);

  it('asks every interval until the limit, then onGiveUp once and nothing more', async () => {
    const tick = waiting();
    const onGiveUp = vi.fn();
    startGenerationPoll(tick, onGiveUp, { intervalMs: 10_000, limitMs: 30_000 });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('a tick that reports the result landed ends the poll: no further tick, no give-up', async () => {
    // The review of PR-batch 24+29 found the poll re-triggering the very
    // generation it waited on; the tick now reads and only the landing refreshes.
    const tick = vi.fn(async () => tick.mock.calls.length >= 2);
    const onGiveUp = vi.fn();
    startGenerationPoll(tick, onGiveUp, { intervalMs: 10_000, limitMs: 120_000 });
    await vi.advanceTimersByTimeAsync(200_000);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('the returned stop cancels the next tick, so an unmounted card asks nothing more', async () => {
    const tick = waiting();
    const onGiveUp = vi.fn();
    const stop = startGenerationPoll(tick, onGiveUp, { intervalMs: 10_000, limitMs: 30_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('a stop during a slow tick lets that read finish and schedules nothing after it', async () => {
    const tick = vi.fn(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000)));
    const onGiveUp = vi.fn();
    const stop = startGenerationPoll(tick, onGiveUp, { intervalMs: 10_000, limitMs: 30_000 });
    await vi.advanceTimersByTimeAsync(11_000);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('a tick that rejects counts as not landed: the poll goes on and still gives up at the limit', async () => {
    // A server action can reject on a network blip; the card must not freeze
    // on "drafting" with no give-up (CodeRabbit, PR #78).
    const tick = vi.fn(async () => {
      throw new Error('network');
    });
    const onGiveUp = vi.fn();
    startGenerationPoll(tick, onGiveUp, { intervalMs: 10_000, limitMs: 20_000 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('the last tick inside the limit is still asked before giving up', async () => {
    const tick = waiting();
    const onGiveUp = vi.fn();
    startGenerationPoll(tick, onGiveUp, { intervalMs: 10_000, limitMs: 10_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });
});
