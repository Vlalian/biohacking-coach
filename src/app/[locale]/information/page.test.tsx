import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  getAthleteByUserId,
  getInformationViewLayout,
  getInformationViewInputs,
} = vi.hoisted(() => ({
    getSession: vi.fn(),
    redirect: vi.fn(() => {
      // The real next-intl redirect() throws to stop rendering; the mock does
      // too, so the page cannot fall through to reading a null session.
      throw new Error('REDIRECT');
    }),
    getAthleteByUserId: vi.fn(),
    getInformationViewLayout: vi.fn(() => Promise.resolve(null)),
    getInformationViewInputs: vi.fn(() =>
      Promise.resolve({ rows: [], streams: {} }),
    ),
  }));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/i18n/navigation', () => ({
  redirect,
  Link: () => null,
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({
  getAthleteByUserId,
  getInformationViewLayout,
}));
vi.mock('@/features/information-view/information-view-repository', () => ({
  getInformationViewInputs,
}));
// The client component pulls in browser deps; the page's wiring is under test.
vi.mock('./information-view', () => ({ InformationView: () => null }));

const { default: InformationPage } = await import('./page');

function render(locale = 'en') {
  return InformationPage({ params: Promise.resolve({ locale }) });
}

describe('InformationPage', () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    getAthleteByUserId.mockReset();
    getInformationViewInputs.mockClear();
  });

  it('redirects a signed-out visitor to sign-in instead of rendering', async () => {
    getSession.mockResolvedValue(null);

    await expect(render('da')).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/sign-in', locale: 'da' });
    expect(getAthleteByUserId).not.toHaveBeenCalled();
  });

  it("reads only the signed-in user's own athlete and their rows", async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      syntheticLabel: null,
    });

    await render();

    expect(getAthleteByUserId).toHaveBeenCalledWith('user_abc');
    expect(getInformationViewInputs).toHaveBeenCalledWith('athlete_1');
  });

  it('a signed-in user without an athlete row gets the fallback, not a crash', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_orphan', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue(undefined);

    await render();

    expect(getInformationViewInputs).not.toHaveBeenCalled();
  });
});
