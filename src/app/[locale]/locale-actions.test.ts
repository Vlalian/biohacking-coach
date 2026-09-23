import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, getUiPrefs } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUiPrefs: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ getUiPrefs }));

const { preferredLocaleAction } = await import('./locale-actions');

/**
 * The sign-in form asks this right after the session exists, so the returning
 * athlete lands in the language they chose — read from their own prefs, never
 * from anything the request names.
 */
describe('preferredLocaleAction', () => {
  beforeEach(() => {
    getSession.mockReset();
    getUiPrefs.mockReset();
  });

  it('returns the stored language for the signed-in user', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    getUiPrefs.mockResolvedValue({ language: 'da' });

    expect(await preferredLocaleAction()).toBe('da');
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
    expect(getUiPrefs).toHaveBeenCalledWith('u1');
  });

  it('returns null when no language is stored', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    getUiPrefs.mockResolvedValue({});

    expect(await preferredLocaleAction()).toBeNull();
  });

  it('returns null when signed out and reads nothing', async () => {
    getSession.mockResolvedValue(null);

    expect(await preferredLocaleAction()).toBeNull();
    expect(getUiPrefs).not.toHaveBeenCalled();
  });
});
