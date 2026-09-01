import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveAthleteId, markUnavailableDate, clearUnavailableDate, revalidatePath } =
  vi.hoisted(() => ({
    resolveAthleteId: vi.fn(),
    markUnavailableDate: vi.fn(),
    clearUnavailableDate: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/availability/unavailable-date', () => ({
  markUnavailableDate,
  clearUnavailableDate,
}));

const { markUnavailableDateAction, clearUnavailableDateAction } = await import(
  './availability-actions'
);

/**
 * Marking a day unavailable parks that day's sessions, and clearing it restores
 * them — but only for a current or future day (ADR 0002). That rule turns on
 * `today`, which is why the action supplies the server's and not the browser's.
 */
const ATHLETE = 'athlete_1';

const cases = [
  ['markUnavailableDateAction', markUnavailableDateAction, markUnavailableDate],
  ['clearUnavailableDateAction', clearUnavailableDateAction, clearUnavailableDate],
] as const;

beforeEach(() => {
  resolveAthleteId.mockReset();
  markUnavailableDate.mockReset();
  clearUnavailableDate.mockReset();
  revalidatePath.mockClear();
});

describe.each(cases)('%s', (_name, action, service) => {
  it('acts as the signed-in athlete, against the server clock', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    service.mockResolvedValue({ ok: true });

    await expect(action('2026-07-16')).resolves.toEqual({ ok: true });
    expect(service).toHaveBeenCalledWith({
      athleteId: ATHLETE,
      date: '2026-07-16',
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('rejects a malformed date before resolving anyone', async () => {
    await expect(action('16-07-2026')).resolves.toEqual({
      ok: false,
      reason: 'invalid-date',
    });
    expect(resolveAthleteId).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request', async () => {
    resolveAthleteId.mockResolvedValue(null);

    await expect(action('2026-07-16')).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(service).not.toHaveBeenCalled();
  });

  it('revalidates nothing when the feature refuses', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    service.mockResolvedValue({ ok: false, reason: 'past' });

    await action('2026-07-16');

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
