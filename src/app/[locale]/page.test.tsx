import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, redirect, getAthleteByUserId } = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    // The real next-intl redirect() throws to stop rendering; the mock does too,
    // so the page cannot fall through to reading a null session.
    throw new Error('REDIRECT');
  }),
  getAthleteByUserId: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key}:${vals.name}` : key,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/i18n/navigation', () => ({ redirect }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
// A client component pulling in better-auth/react; stub it out of the node test.
vi.mock('./sign-out-button', () => ({ SignOutButton: () => null }));

const { default: AthletePage } = await import('./page');

function render(locale = 'en') {
  return AthletePage({ params: Promise.resolve({ locale }) });
}

describe('AthletePage', () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    getAthleteByUserId.mockReset();
  });

  it('redirects a signed-out visitor to sign-in instead of rendering', async () => {
    getSession.mockResolvedValue(null);

    await expect(render('da')).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/sign-in', locale: 'da' });
    // It never reached the athlete lookup — the page is not a page when signed out.
    expect(getAthleteByUserId).not.toHaveBeenCalled();
  });

  it('resolves a signed-in user to their own athlete row', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });

    await render();

    expect(redirect).not.toHaveBeenCalled();
    // Resolution goes through the session's user id, never a name or email.
    expect(getAthleteByUserId).toHaveBeenCalledWith('user_abc');
  });
});
