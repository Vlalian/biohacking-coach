import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, getAthleteByUserId, saveLayout } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAthleteByUserId: vi.fn(),
  saveLayout: vi.fn(() => Promise.resolve({ ok: true as const })),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/information-view/save-layout', () => ({ saveLayout }));

const { saveLayoutAction } = await import('./layout-actions');

describe('saveLayoutAction', () => {
  beforeEach(() => {
    getSession.mockReset();
    getAthleteByUserId.mockReset();
    saveLayout.mockClear();
  });

  it('resolves the owning athlete from the session, never from the request', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1' });

    const result = await saveLayoutAction(['sleep'], 'r4');

    expect(result).toEqual({ ok: true });
    expect(getAthleteByUserId).toHaveBeenCalledWith('user_abc');
    expect(saveLayout).toHaveBeenCalledWith('athlete_1', ['sleep'], 'r4');
  });

  it('refuses a signed-out request without touching storage', async () => {
    getSession.mockResolvedValue(null);

    const result = await saveLayoutAction(['sleep'], 'r4');

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(saveLayout).not.toHaveBeenCalled();
  });

  it('refuses a user with no athlete row without touching storage', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_orphan' } });
    getAthleteByUserId.mockResolvedValue(undefined);

    const result = await saveLayoutAction(['sleep'], 'r4');

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(saveLayout).not.toHaveBeenCalled();
  });
});
