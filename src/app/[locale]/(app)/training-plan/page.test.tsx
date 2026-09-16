import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  getAthleteByUserId,
  getSessionsForAthlete,
  getUnavailableDates,
  listPendingActivities,
  listImportedSessionIds,
  after,
  ensureBlocksAdjusted,
  getResolvedBlocks,
} = vi.hoisted(() => ({
    after: vi.fn((task: () => Promise<void>) => task()),
    ensureBlocksAdjusted: vi.fn(() => Promise.resolve('drafted')),
    getResolvedBlocks: vi.fn(() => Promise.resolve({ race: null, set: null, blocks: [] })),
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
vi.mock('next/server', () => ({ after }));
vi.mock('@/features/coach/training-block-service', () => ({ ensureBlocksAdjusted, getResolvedBlocks }));
// The drafted week the athlete has not decided on (training-architecture/18):
// read here with today as `asOf`, passed to the calendar, never fetched by it.
const getCalendarProposalState = vi.fn(() => Promise.resolve(null as unknown));
vi.mock('@/features/coach/week-draft-repository', () => ({ getCalendarProposalState }));
vi.mock('../../block-strip', () => ({ BlockStrip: () => null }));
vi.mock('@/i18n/navigation', () => ({ redirect, Link: () => null }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/session/session-repository', () => ({ getSessionsForAthlete }));
vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates }));
const { getHealthHistory } = vi.hoisted(() => ({
  getHealthHistory: vi.fn(async () => ({ injuries: [], illnesses: [] })),
}));
vi.mock('@/features/health/health-repository', () => ({ getHealthHistory }));
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
    // The health layer (training-architecture/06): their own rows only.
    expect(getHealthHistory).toHaveBeenCalledWith('athlete_1');
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

describe('TrainingPlanPage — the Training Block adjustment trigger (training-architecture/07)', () => {
  beforeEach(() => {
    after.mockClear();
    ensureBlocksAdjusted.mockClear();
    getResolvedBlocks.mockClear();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    getAthleteByUserId.mockResolvedValue({ id: 'a1' });
  });

  it('runs the adjustment through after(), not on the render path', async () => {
    await render();

    expect(after).toHaveBeenCalledTimes(1);
    expect(ensureBlocksAdjusted).toHaveBeenCalledWith('a1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('reads the resolved blocks for the strip, scoped to the athlete', async () => {
    await render();
    expect(getResolvedBlocks).toHaveBeenCalledWith('a1', expect.any(String));
  });

  it('swallows and logs a thrown adjustment rather than failing the request', async () => {
    ensureBlocksAdjusted.mockRejectedValueOnce(new Error('upstream'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render()).resolves.toBeDefined();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('block_adjustment_failed'));
    spy.mockRestore();
  });

  it('does nothing for a signed-in user with no athlete row', async () => {
    getAthleteByUserId.mockResolvedValue(undefined);
    await render();
    expect(after).not.toHaveBeenCalled();
    expect(getResolvedBlocks).not.toHaveBeenCalled();
  });
});

describe('TrainingPlanPage — the drafted week (training-architecture/18)', () => {
  it('reads the calendar proposal state as the athlete, with today, for a signed-in athlete', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', profile: {} });
    await render();
    expect(getCalendarProposalState).toHaveBeenCalledWith('athlete_1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('reads nothing for a user with no athlete row', async () => {
    getCalendarProposalState.mockClear();
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue(undefined);
    await render();
    expect(getCalendarProposalState).not.toHaveBeenCalled();
  });
});
