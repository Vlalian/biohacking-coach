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
vi.mock('@/i18n/navigation', () => ({ redirect, Link: () => null }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/coach/coach-repository', () => ({ getCoachByUserId }));
vi.mock('@/features/coach/roster-service', () => ({ getCoachAthleteView }));
vi.mock('@/features/coach/conversation-repository', () => ({
  getLatestBriefingWithMessages,
}));
// Client components pulling in browser deps; the page's own wiring is under test.
vi.mock('@/app/[locale]/calendar', () => ({ Calendar: () => null }));
vi.mock('@/app/[locale]/(app)/information/information-view', () => ({
  InformationView: () => null,
}));
vi.mock('./prescribe-panel', () => ({ PrescribePanel: () => null }));
vi.mock('./briefing', () => ({ Briefing: () => null }));

const { default: CoachAthletePage } = await import('./page');

function render(athleteId = 'a1', locale = 'en') {
  return CoachAthletePage({ params: Promise.resolve({ locale, athleteId }) });
}

describe('CoachAthletePage — the gate', () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    notFound.mockClear();
    getCoachByUserId.mockReset();
    getCoachAthleteView.mockReset();
  });

  it('redirects a signed-out visitor before reading anything', async () => {
    getSession.mockResolvedValue(null);

    await expect(render()).rejects.toThrow('REDIRECT');
    expect(getCoachByUserId).not.toHaveBeenCalled();
    expect(getCoachAthleteView).not.toHaveBeenCalled();
  });

  it('refuses a coach with no active link to the requested athlete (404)', async () => {
    getSession.mockResolvedValue({ user: { id: 'coach_user' } });
    getCoachByUserId.mockResolvedValue({ id: 'coach_1', informationViewLayout: null });
    // The service is the gate: no active link → null → the page 404s. A forged
    // athlete id reaches exactly this path.
    getCoachAthleteView.mockResolvedValue(null);

    await expect(render('forged-athlete-id')).rejects.toThrow('NOT_FOUND');
    expect(getCoachAthleteView).toHaveBeenCalledWith(
      'coach_1',
      'forged-athlete-id',
      expect.any(String),
    );
  });

  it('renders the athlete view when an active link resolves', async () => {
    getSession.mockResolvedValue({ user: { id: 'coach_user' } });
    getCoachByUserId.mockResolvedValue({ id: 'coach_1', informationViewLayout: null });
    getCoachAthleteView.mockResolvedValue({
      athleteName: 'Mads',
      visibility: { shareAthleteReports: true, shareAiTranscripts: false },
      calendarSessions: [],
      dataset: { sessions: [], weekly: [] },
    });

    await expect(render('a1')).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });
});
