import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  notFound,
  getCoachByUserId,
  getCoachAthleteView,
  getLatestBriefingWithMessages,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  getCoachByUserId: vi.fn(),
  getCoachAthleteView: vi.fn(),
  getLatestBriefingWithMessages: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/i18n/navigation', () => ({
  redirect,
  Link: () => null,
  usePathname: () => '/coach/athlete/a1/plan',
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/coach/coach-repository', () => ({ getCoachByUserId }));
vi.mock('@/features/coach/roster-service', () => ({ getCoachAthleteView }));
vi.mock('@/features/coach/conversation-repository', () => ({
  getLatestBriefingWithMessages,
}));
// Client components pulling in browser deps, and a server-action module whose
// import chain reaches auth. The pages' own wiring is what is under test.
vi.mock('@/app/[locale]/calendar', () => ({ Calendar: () => null }));
vi.mock('@/app/[locale]/(app)/information/information-view', () => ({
  InformationView: () => null,
}));
vi.mock('./prescribe-panel', () => ({ PrescribePanel: () => null }));
vi.mock('./briefing', () => ({ Briefing: () => null }));
vi.mock('./shared-conversations', () => ({ SharedConversations: () => null }));
vi.mock('./coach-layout-actions', () => ({ saveCoachLayoutAction: vi.fn() }));

const { default: PlanPage } = await import('./plan/page');
const { default: InformationPage } = await import('./information/page');
const { default: BriefingPage } = await import('./briefing/page');
const { default: AthleteIndexPage } = await import('./page');

/**
 * Every tab is independently reachable by URL, so every tab is gated
 * independently — a Next.js layout does not protect the pages beneath it. These
 * assertions therefore run against all three rather than against one and a
 * hope. The athlete surface was split into tabs on 2026-08-21; before that
 * there was a single page and a single copy of this check.
 */
const TABS = [
  ['Plan', PlanPage],
  ['Data', InformationPage],
  ['Briefing', BriefingPage],
] as const;

type Page = (args: {
  params: Promise<{ locale: string; athleteId: string }>;
}) => Promise<unknown>;

function render(page: Page, athleteId = 'a1', locale = 'en') {
  return page({ params: Promise.resolve({ locale, athleteId }) });
}

const A_LINKED_VIEW = {
  athleteName: 'Mads',
  visibility: { shareAthleteReports: true, shareAiTranscripts: false },
  calendarSessions: [],
  unavailableDates: [],
  planSessions: [],
  sharedTranscripts: null,
  dataset: { sessions: [], weekly: [] },
};

describe.each(TABS)('the %s tab — the gate', (_name, page) => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    notFound.mockClear();
    getCoachByUserId.mockReset();
    getCoachAthleteView.mockReset();
  });

  it('redirects a signed-out visitor before reading anything', async () => {
    getSession.mockResolvedValue(null);

    await expect(render(page as Page)).rejects.toThrow('REDIRECT');
    expect(getCoachByUserId).not.toHaveBeenCalled();
    expect(getCoachAthleteView).not.toHaveBeenCalled();
  });

  it('refuses a coach with no active link to the requested athlete (404)', async () => {
    getSession.mockResolvedValue({ user: { id: 'coach_user' } });
    getCoachByUserId.mockResolvedValue({ id: 'coach_1', informationViewLayout: null });
    // The service is the gate: no active link → null → 404. A forged athlete id
    // reaches exactly this path, on every tab.
    getCoachAthleteView.mockResolvedValue(null);

    await expect(render(page as Page, 'forged-athlete-id')).rejects.toThrow('NOT_FOUND');
    expect(getCoachAthleteView).toHaveBeenCalledWith(
      'coach_1',
      'forged-athlete-id',
      expect.any(String),
    );
  });

  it('shows a signed-in non-coach the not-a-coach state rather than a 404', async () => {
    // Holding no coach row is not a forged request — the page exists, it is
    // just not theirs. It must not read the athlete's data to find that out.
    getSession.mockResolvedValue({ user: { id: 'athlete_user' } });
    getCoachByUserId.mockResolvedValue(undefined);

    await expect(render(page as Page)).resolves.toBeTruthy();
    expect(getCoachAthleteView).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('renders when an active link resolves', async () => {
    getSession.mockResolvedValue({ user: { id: 'coach_user' } });
    getCoachByUserId.mockResolvedValue({ id: 'coach_1', informationViewLayout: null });
    getCoachAthleteView.mockResolvedValue(A_LINKED_VIEW);

    await expect(render(page as Page)).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe('the athlete surface index', () => {
  it('opens on the Plan tab', async () => {
    // Kept as a redirect rather than deleted so links and bookmarks written
    // against /coach/athlete/<id> before the tabs existed still resolve.
    redirect.mockClear();

    await expect(render(AthleteIndexPage as Page)).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith({
      href: '/coach/athlete/a1/plan',
      locale: 'en',
    });
  });
});
