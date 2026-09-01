import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveAthleteId, rateSession, revalidatePath } = vi.hoisted(() => ({
  resolveAthleteId: vi.fn(),
  rateSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/session/rate-session', () => ({ rateSession }));

const { rateSessionAction } = await import('./rate-actions');

/**
 * The Session Reflection is the gesture that commits a session to the record
 * (CONTEXT.md), so the boundary matters: the rating is stored against the
 * signed-in athlete's session, never against whoever the request names.
 */
describe('rateSessionAction', () => {
  beforeEach(() => {
    resolveAthleteId.mockReset();
    rateSession.mockReset();
    revalidatePath.mockClear();
  });

  it('rates as the signed-in athlete', async () => {
    resolveAthleteId.mockResolvedValue('athlete_1');
    rateSession.mockResolvedValue({ ok: true });

    const result = await rateSessionAction('sess_1', 7, 6, 'Legs heavy.');

    expect(result).toEqual({ ok: true });
    expect(rateSession).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: 'athlete_1', sessionId: 'sess_1' }),
    );
  });

  it('refuses a signed-out request without writing a rating', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await rateSessionAction('sess_1', 7, 6, null);

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(rateSession).not.toHaveBeenCalled();
  });

  it('does not revalidate when the rating was refused', async () => {
    resolveAthleteId.mockResolvedValue('athlete_1');
    rateSession.mockResolvedValue({ ok: false, reason: 'not-found' });

    await rateSessionAction('sess_1', 7, 6, null);

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
