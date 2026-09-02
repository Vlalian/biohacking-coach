import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  getAthleteByUserId,
  getSessionsForAthlete,
  getUnavailableDates,
  listPendingActivities,
  listImportedSessionIds,
} = vi.hoisted(() => ({
    getSession: vi.fn(),
    redirect: vi.fn(() => {
      // The real next-intl redirect() throws to stop rendering; the mock does
      // too, so the page cannot fall through to reading a null session.
      throw new Error('REDIRECT');
    }),
    getAthleteByUserId: vi.fn(),
    getSessionsForAthlete: vi.fn(() => Promise.resolve([])),
    getUnavailableDates: vi.fn(() => Promise.resolve([])),
    listPendingActivities: vi.fn(() => Promise.resolve([])),
    listImportedSessionIds: vi.fn(() => Promise.resolve([])),
  }));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/i18n/navigation', () => ({ redirect, Link: () => null }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/session/session-repository', () => ({ getSessionsForAthlete }));
vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates }));
vi.mock('@/features/garmin/detected-activity', () => ({
  listPendingActivities,
  listImportedSessionIds,
}));
// The client calendar pulls in browser deps; the page's own wiring is under
// test here, not its rendering.
vi.mock('../../calendar', () => ({ Calendar: () => null }));
vi.mock('../../garmin-upload', () => ({ GarminUpload: () => null }));
vi.mock('../../detected-activities', () => ({ DetectedActivities: () => null }));

const { default: TrainingPlanPage } = await import('./page');

function render(locale = 'en') {
  return TrainingPlanPage({ params: Promise.resolve({ locale }) });
}

describe('TrainingPlanPage', () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    getAthleteByUserId.mockReset();
    getSessionsForAthlete.mockClear();
    getUnavailableDates.mockClear();
    listPendingActivities.mockClear();
    listImportedSessionIds.mockClear();
  });

  it('redirects a signed-out visitor to sign-in instead of rendering', async () => {
    getSession.mockResolvedValue(null);

    await expect(render('da')).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/sign-in', locale: 'da' });
    expect(getAthleteByUserId).not.toHaveBeenCalled();
  });

  it("reads only the signed-in user's own sessions and unavailable dates", async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });

    await render();

    expect(getSessionsForAthlete).toHaveBeenCalledWith('athlete_1');
    expect(getUnavailableDates).toHaveBeenCalledWith('athlete_1');
    // Pending Detected Activities are scoped the same way — a proposal is as
    // much the athlete's own data as a session (ADR 0006).
    expect(listPendingActivities).toHaveBeenCalledWith('athlete_1');
    expect(listImportedSessionIds).toHaveBeenCalledWith('athlete_1');
  });

  it('a signed-in user without an athlete row gets empty state, not a crash', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_orphan', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue(undefined);

    await render();

    expect(getSessionsForAthlete).not.toHaveBeenCalled();
    expect(getUnavailableDates).not.toHaveBeenCalled();
    expect(listPendingActivities).not.toHaveBeenCalled();
    expect(listImportedSessionIds).not.toHaveBeenCalled();
  });
});
