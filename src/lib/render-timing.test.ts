import { describe, it, expect, vi, afterEach } from 'vitest';
import { timed } from './render-timing';

/**
 * The measurement `code-health/09` asks for before anything is tuned further:
 * how long a render's read groups take, on production, as one JSON line each.
 * Off unless RENDER_TIMING=1, so a normal deploy logs nothing.
 */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('timed', () => {
  it('logs one render_timing line when RENDER_TIMING=1', async () => {
    vi.stubEnv('RENDER_TIMING', '1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await timed('plan.reads', async () => 7)).toBe(7);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warn.mock.calls[0][0] as string);
    expect(line).toEqual({ event: 'render_timing', label: 'plan.reads', ms: expect.any(Number) });
    expect(line.ms).toBeGreaterThanOrEqual(0);
  });

  it('logs nothing when RENDER_TIMING is unset, and still returns the value', async () => {
    vi.stubEnv('RENDER_TIMING', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await timed('plan.reads', async () => 7)).toBe(7);
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs nothing for any value other than 1', async () => {
    vi.stubEnv('RENDER_TIMING', 'true');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await timed('plan.reads', async () => 7);
    expect(warn).not.toHaveBeenCalled();
  });

  it('measures the time the work took', async () => {
    vi.stubEnv('RENDER_TIMING', '1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const now = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(142.6);

    await timed('shell.reads', async () => null);

    expect(now).toHaveBeenCalledTimes(2);
    expect(JSON.parse(warn.mock.calls[0][0] as string).ms).toBe(43);
  });

  it('passes a failure through without logging it as a timing', async () => {
    vi.stubEnv('RENDER_TIMING', '1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(timed('plan.reads', async () => { throw new Error('down'); })).rejects.toThrow('down');
    expect(warn).not.toHaveBeenCalled();
  });
});
