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
  updatePreferredNameAction: vi.fn(),
  updateLinkVisibilityAction: vi.fn(),
  updateRaceDistanceAction: vi.fn(),
  updateTargetRaceAction: vi.fn(),
  addRaceAction: vi.fn(),
  setTargetRaceAction: vi.fn(),
  removeRaceAction: vi.fn(),
  updateWeeklySessionDayAction: vi.fn(),
}));

const { getRaces } = vi.hoisted(() => ({
  // No races: the state of every fixture here, and the one the page has to
  // render without inventing a horizon.
  getRaces: vi.fn<() => Promise<unknown[]>>(async () => []),
}));
vi.mock('@/features/race/race-repository', () => ({ getRaces }));

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
      // No races and no distance: the state of an athlete who has not answered,
      // passed through as empty rather than defaulted to a distance nobody chose.
      races: [],
      raceDistance: '',
      weeklySessionDay: null,
      fixedConstraints: [],
    });
    expect(props.language).toBe('en');
    expect(props.coachingLink).toBeNull();
  });

  it("passes the athlete's races, target flagged, so Settings can change them", async () => {
    // Issue 17's AC: the race is editable here, not write-once at onboarding —
    // and since `training-architecture/09`, so are the races beside it. Read
    // from the race repository, scoped to this athlete, not from the mirror
    // column.
    getSession.mockResolvedValue({
      user: { id: 'user_abc', name: 'Mads', email: 'mads@example.com' },
    });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      communicationStyle: null,
      raceTarget: 'Ironman Copenhagen',
      profile: null,
    });
    getRaces.mockResolvedValue([
      { id: 'r1', athleteId: 'athlete_1', name: 'Ironman Copenhagen', date: '2027-08-15', distance: 'Full', isTarget: true, createdAt: new Date() },
      { id: 'r2', athleteId: 'athlete_1', name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic', isTarget: false, createdAt: new Date() },
    ]);
    getUiPrefs.mockResolvedValue({});

    const element = await render('en');

    expect(getRaces).toHaveBeenCalledWith('athlete_1');
    const props = (element as unknown as { props: Record<string, unknown> }).props;
    expect(props.profile).toMatchObject({
      races: [
        { id: 'r1', name: 'Ironman Copenhagen', date: '2027-08-15', distance: 'Full', isTarget: true },
        { id: 'r2', name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic', isTarget: false },
      ],
    });
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
    // And no Preferred Name reads as '' — the field renders empty, never the
    // account name (preferred-name/02).
    expect(props.preferredName).toBe('');
  });

  it('passes the stored Preferred Name through the user seam, beside the language', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user_abc', name: 'Mads Kilstrup', email: 'mads@example.com' },
    });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', communicationStyle: null, profile: null });
    getUiPrefs.mockResolvedValue({ language: 'en', preferredName: 'Captain' });

    const element = await render('en');

    const props = (element as unknown as { props: Record<string, unknown> }).props;
    expect(props.preferredName).toBe('Captain');
    expect(getUiPrefs).toHaveBeenCalledWith('user_abc');
  });
});
