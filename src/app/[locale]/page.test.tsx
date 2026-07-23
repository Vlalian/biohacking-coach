import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  getAthleteByUserId,
  provisionAthlete,
  getSessionsForAthlete,
  getUnavailableDates,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    // The real next-intl redirect() throws to stop rendering; the mock does too,
    // so the page cannot fall through to reading a null session.
    throw new Error('REDIRECT');
  }),
  getAthleteByUserId: vi.fn(),
  provisionAthlete: vi.fn(),
  getSessionsForAthlete: vi.fn(() => Promise.resolve([])),
  getUnavailableDates: vi.fn(() => Promise.resolve([])),
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
vi.mock('@/features/athlete/athlete-provisioning', () => ({ provisionAthlete }));
vi.mock('@/features/session/session-repository', () => ({ getSessionsForAthlete }));
vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates }));
// Client components / server actions pulling in browser + auth deps; stub them
// out of the node test — the page's own wiring is what's under test here.
vi.mock('./sign-out-button', () => ({ SignOutButton: () => null }));
vi.mock('./calendar', () => ({ Calendar: () => null }));
vi.mock('./garmin-upload', () => ({ GarminUpload: () => null }));

const { default: AthletePage } = await import('./page');

function render(locale = 'en') {
  return AthletePage({ params: Promise.resolve({ locale }) });
}

describe('AthletePage', () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    getAthleteByUserId.mockReset();
    provisionAthlete.mockReset();
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
    // The row was already there, so no recovery provisioning was needed.
    expect(provisionAthlete).not.toHaveBeenCalled();
  });

  it('self-heals a signed-in user whose athlete row is missing', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_orphan', name: 'Mads' } });
    // Missing on first read, present after recovery provisioning.
    getAthleteByUserId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'athlete_2', syntheticLabel: null });

    await render();

    expect(provisionAthlete).toHaveBeenCalledWith('user_orphan');
    expect(getAthleteByUserId).toHaveBeenCalledTimes(2);
    expect(redirect).not.toHaveBeenCalled();
  });
});
