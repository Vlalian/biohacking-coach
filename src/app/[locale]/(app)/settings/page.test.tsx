import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  getAthleteByUserId,
  getLinkForAthlete,
  getUiPrefs,
  SettingsView,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    // The real next-intl redirect() throws to stop rendering; the mock does
    // too, so the page cannot fall through to reading a null session.
    throw new Error('REDIRECT');
  }),
  getAthleteByUserId: vi.fn(),
  // No default resolved value here — pinning one narrows the mock's inferred
  // return type, and later tests resolve it to a real link object.
  getLinkForAthlete: vi.fn(),
  getUiPrefs: vi.fn(() => Promise.resolve({})),
  SettingsView: vi.fn(() => null),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/i18n/navigation', () => ({ redirect }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/coach/coach-repository', () => ({ getLinkForAthlete }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ getUiPrefs }));
// The client component pulls in browser deps (next-themes, i18n navigation);
// the page's data wiring is what is under test here.
vi.mock('./settings-view', () => ({ SettingsView }));
vi.mock('./settings-actions', () => ({
  addFixedConstraintAction: vi.fn(),
  removeFixedConstraintAction: vi.fn(),
  severCoachingLinkAction: vi.fn(),
  updateCommunicationStyleAction: vi.fn(),
  updateLanguageAction: vi.fn(),
  updateLinkVisibilityAction: vi.fn(),
  updateRaceTargetAction: vi.fn(),
  updateWeeklySessionDayAction: vi.fn(),
}));

const { default: SettingsPage } = await import('./page');

function render(locale = 'en') {
  return SettingsPage({ params: Promise.resolve({ locale }) });
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLinkForAthlete.mockResolvedValue(undefined);
    getUiPrefs.mockResolvedValue({});
  });

  it('redirects a signed-out visitor to sign-in instead of rendering', async () => {
    getSession.mockResolvedValue(null);

    await expect(render('da')).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/sign-in', locale: 'da' });
    expect(getAthleteByUserId).not.toHaveBeenCalled();
  });

  it("reads only the signed-in user's own athlete, scoped by user id", async () => {
    getSession.mockResolvedValue({
      user: { id: 'user_abc', name: 'Mads', email: 'mads@example.com' },
    });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      communicationStyle: 'Direct, technical.',
      profile: { weeklySessionDay: 'Monday', fixedConstraints: ['Thursday'] },
    });

    await render();

    expect(getAthleteByUserId).toHaveBeenCalledWith('user_abc');
    expect(getLinkForAthlete).toHaveBeenCalledWith('athlete_1');
    expect(getUiPrefs).toHaveBeenCalledWith('user_abc');
  });

  it('a signed-in user without an athlete row gets the fallback, not a crash', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_orphan' } });
    getAthleteByUserId.mockResolvedValue(undefined);

    const element = await render();

    expect(getLinkForAthlete).not.toHaveBeenCalled();
    // The fallback branch never builds a SettingsView element at all.
    expect((element as unknown as { type: unknown }).type).not.toBe(SettingsView);
  });

  it('passes solo defaults when the athlete has no profile fields and no link yet', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user_abc', name: 'Mads', email: 'mads@example.com' },
    });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      communicationStyle: null,
      profile: null,
    });
    getLinkForAthlete.mockResolvedValue(undefined);
    getUiPrefs.mockResolvedValue({});

    const element = await render('en');

    // JSX only records props on the element — SettingsView itself is never
    // invoked without a renderer, so the props live on `element.props`, not
    // on a mock call.
    const props = (element as unknown as { props: Record<string, unknown> }).props;
    expect(props.profile).toEqual({
      name: 'Mads',
      email: 'mads@example.com',
      communicationStyle: '',
      raceTarget: '',
      weeklySessionDay: null,
      fixedConstraints: [],
    });
    expect(props.language).toBe('en');
    expect(props.coachingLink).toBeNull();
  });

  it("passes the athlete's stored race target so Settings can change it", async () => {
    // Issue 17's AC: race target is editable here, not write-once at onboarding.
    getSession.mockResolvedValue({
      user: { id: 'user_abc', name: 'Mads', email: 'mads@example.com' },
    });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      communicationStyle: null,
      raceTarget: 'Ironman Copenhagen 2026-08-16',
      profile: null,
    });
    getUiPrefs.mockResolvedValue({});

    const element = await render('en');

    const props = (element as unknown as { props: Record<string, unknown> }).props;
    expect(props.profile).toMatchObject({ raceTarget: 'Ironman Copenhagen 2026-08-16' });
  });

  it('maps the athlete-side Coaching Link into the flat shape the view expects', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user_abc', name: 'Mads', email: 'mads@example.com' },
    });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      communicationStyle: null,
      profile: null,
    });
    getLinkForAthlete.mockResolvedValue({
      headCoachName: 'Lars Nielsen',
      link: {
        id: 'link_1',
        coachId: 'coach_1',
        athleteId: 'athlete_1',
        status: 'active',
        visibility: { shareAthleteReports: true, shareAiTranscripts: false },
      },
    });

    const element = await render('en');

    const props = (element as unknown as { props: Record<string, unknown> }).props;
    expect(props.coachingLink).toEqual({
      headCoachName: 'Lars Nielsen',
      shareAthleteReports: true,
      shareAiTranscripts: false,
    });
  });

  it('falls back to the route locale when the athlete has never chosen a language', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user_abc', name: 'Mads', email: 'mads@example.com' },
    });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      communicationStyle: null,
      profile: null,
    });
    getUiPrefs.mockResolvedValue({});

    const element = await render('da');

    const props = (element as unknown as { props: Record<string, unknown> }).props;
    expect(props.language).toBe('da');
  });
});
