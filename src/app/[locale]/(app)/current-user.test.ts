import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, getAthleteByUserId } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAthleteByUserId: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));

const { getCurrentSession, getCurrentAthlete } = await import('./current-user');

/**
 * The layout and every page under it read the same two things — the session
 * and the athlete — and before `code-health/09` each read them again. These
 * are the one shared read. React's `cache()` is what makes a render ask once;
 * outside a server request it is a pass-through, so what is pinned here is the
 * wiring, not the deduplication (that is React's guarantee).
 */
beforeEach(() => {
  getSession.mockReset();
  getAthleteByUserId.mockReset();
});

describe('getCurrentAthlete', () => {
  it('reads the athlete for the signed-in user', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    getAthleteByUserId.mockResolvedValue({ id: 'a1' });

    expect(await getCurrentAthlete()).toEqual({ id: 'a1' });
    expect(getAthleteByUserId).toHaveBeenCalledWith('u1');
  });

  it('is undefined without a session, and reads no athlete', async () => {
    getSession.mockResolvedValue(null);

    expect(await getCurrentAthlete()).toBeUndefined();
    expect(getAthleteByUserId).not.toHaveBeenCalled();
  });
});

describe('getCurrentSession', () => {
  it('is the session auth returns for this request', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', name: 'Mads' } });

    expect(await getCurrentSession()).toEqual({ user: { id: 'u1', name: 'Mads' } });
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });
});
