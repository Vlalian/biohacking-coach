import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDays, today } from '@/lib/date';

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
  getUiPrefs,
} = vi.hoisted(() => ({
    getUiPrefs: vi.fn((): Promise<{ language?: string }> => Promise.resolve({})),
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
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ getUiPrefs }));
// The drafted week the athlete has not decided on (training-architecture/18):
// read here with today as `asOf`, passed to the calendar, never fetched by it.
// Since training-architecture/29 the read is the service's slot state, which
// adds "drafting" while the shell's after() is still writing the draft.
const calendarSlotState = vi.fn(() => Promise.resolve(null as unknown));
vi.mock('@/features/coach/week-draft-service', () => ({ calendarSlotState }));
const BlockStrip = vi.fn(() => null);
vi.mock('../../block-strip', () => ({ BlockStrip }));
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
const Calendar = vi.fn(() => null);
vi.mock('../../calendar', () => ({ Calendar }));
vi.mock('../../garmin-upload', () => ({ GarminUpload: () => null }));
vi.mock('../../detected-activities', () => ({ DetectedActivities: () => null }));
// The cycle line names a linked Head Coach (training-architecture/42): the
// page reads the athlete's own link and hands the name down.
const WeeklySessionDayLine = vi.fn(() => null);
vi.mock('../../weekly-session-day-line', () => ({ WeeklySessionDayLine }));
const getLinkForAthlete = vi.fn(async (): Promise<unknown> => undefined);
vi.mock('@/features/coach/coach-repository', () => ({ getLinkForAthlete }));
// The athlete's races, drawn on their days (training-architecture/37).
const getRaces = vi.fn(async (): Promise<unknown[]> => []);
vi.mock('@/features/race/race-repository', () => ({ getRaces }));

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
    // No language stored: none is passed, and the service stays English.
    expect(ensureBlocksAdjusted).toHaveBeenCalledWith(
      'a1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      undefined,
    );
  });

  it("passes the signed-in athlete's language, so a Danish athlete's blocks are shaped in Danish (showable-version/46)", async () => {
    getUiPrefs.mockResolvedValueOnce({ language: 'da' });

    await render();

    expect(getUiPrefs).toHaveBeenCalledWith('u1');
    expect(ensureBlocksAdjusted).toHaveBeenCalledWith('a1', expect.any(String), 'da');
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

/** The first element of `type` in a React tree the page returned — the page is not rendered, its wiring is read. */
function findElement(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  const element = node as { type?: unknown; props?: { children?: unknown } };
  if (element.type === type) return element as { props: Record<string, unknown> };
  return findElement(element.props?.children, type);
}

describe('TrainingPlanPage — the drafted week (training-architecture/18, 29)', () => {
  it('asks the service for the slot state — proposal or drafting — as the athlete, with today, and passes it to the calendar', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', profile: {} });
    calendarSlotState.mockResolvedValue({ kind: 'drafting', weekStart: '2026-09-21' });
    const tree = await render();
    expect(calendarSlotState).toHaveBeenCalledWith('athlete_1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(findElement(tree, Calendar)?.props.proposal).toEqual({ kind: 'drafting', weekStart: '2026-09-21' });
  });

  it('reads nothing for a user with no athlete row', async () => {
    calendarSlotState.mockClear();
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue(undefined);
    await render();
    expect(calendarSlotState).not.toHaveBeenCalled();
  });
});

describe('TrainingPlanPage — the cycle line names a linked Head Coach (training-architecture/42)', () => {
  const LINK = { id: 'link_1', coachId: 'coach_1', athleteId: 'athlete_1', status: 'active' };
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', profile: { weeklySessionDay: 'Wednesday' } });
  });

  it('tells the cycle line who the Head Coach is, preferring their chosen name, reading the athlete’s own link', async () => {
    getLinkForAthlete.mockResolvedValue({ headCoachName: 'Sarah Berg', headCoachPreferredName: 'Coach B', link: LINK });
    const line = findElement(await render(), WeeklySessionDayLine)?.props;
    expect(getLinkForAthlete).toHaveBeenCalledWith('athlete_1');
    expect(line).toMatchObject({ weeklySessionDay: 'Wednesday', headCoachName: 'Coach B' });
  });

  it('falls back to the account name, and passes null when there is no link', async () => {
    getLinkForAthlete.mockResolvedValue({ headCoachName: 'Sarah Berg', headCoachPreferredName: null, link: LINK });
    expect(findElement(await render(), WeeklySessionDayLine)?.props.headCoachName).toBe('Sarah Berg');
    getLinkForAthlete.mockResolvedValue(undefined);
    expect(findElement(await render(), WeeklySessionDayLine)?.props.headCoachName).toBeNull();
  });
});

describe('TrainingPlanPage — the reads run together (code-health/09)', () => {
  const reads = () => [
    getSessionsForAthlete,
    getUnavailableDates,
    listPendingActivities,
    listImportedSessionIds,
    getResolvedBlocks,
    calendarSlotState,
    getHealthHistory,
    getLinkForAthlete,
  ];

  it('starts every calendar read before any of them resolves', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1' });
    const never = () => new Promise<never>(() => {});
    const saved = reads().map((m) => m.getMockImplementation());
    for (const m of reads()) {
      m.mockClear();
      (m as unknown as { mockImplementation: (f: () => Promise<never>) => void }).mockImplementation(never);
    }

    void render();
    // Let the session and athlete reads settle; the calendar reads never do.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    for (const m of reads()) expect(m).toHaveBeenCalledTimes(1);
    reads().forEach((m, i) =>
      (m as unknown as { mockImplementation: (f: unknown) => void }).mockImplementation(saved[i]),
    );
  });
});

describe('TrainingPlanPage — races in the calendar (training-architecture/37)', () => {
  it('reads the athlete\'s own races and hands the calendar only what a day block shows', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', profile: {} });
    getRaces.mockResolvedValue([
      { id: 'r1', athleteId: 'athlete_1', name: 'IM Kbh', date: '2027-08-16', distance: 'Full', isTarget: true, createdAt: new Date() },
    ]);
    const tree = await render();
    expect(getRaces).toHaveBeenCalledWith('athlete_1');
    expect(findElement(tree, Calendar)?.props.races).toEqual([
      { name: 'IM Kbh', date: '2027-08-16', distance: 'Full', isTarget: true },
    ]);
  });

  it('passes no races for a user with no athlete row', async () => {
    getRaces.mockClear();
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue(undefined);
    const tree = await render();
    expect(getRaces).not.toHaveBeenCalled();
    expect(findElement(tree, Calendar)?.props.races).toEqual([]);
  });
});

describe('TrainingPlanPage — the Open Horizon under the month (training-architecture/13)', () => {
  // The page reads the real clock; the dates are laid out around it.
  const inDays = (n: number) => addDays(today(), n);
  const block = { index: 1, total: 4, name: 'Base', startDate: inDays(-10), endDate: inDays(31), authoredBy: 'arithmetic', purpose: 'base' };

  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', profile: {} });
  });

  it('names the block and the week with no race line and no count, for an athlete with no race', async () => {
    getResolvedBlocks.mockResolvedValueOnce({ race: null, set: null, blocks: [block], horizon: 'open', raceTooClose: false } as never);
    const tree = await render();
    const phase = findElement(tree, Calendar)?.props.phase as Record<string, unknown>;
    expect(phase).toMatchObject({ blockName: 'Base', week: 2 });
    expect(phase).not.toHaveProperty('raceName');
    expect(phase).not.toHaveProperty('daysToRace');
    expect(findElement(tree, BlockStrip)?.props.race).toBeNull();
  });

  it('a race too close for blocks is still named, with its days to go', async () => {
    const race = { id: 'r1', name: 'Aarhus 70.3', date: inDays(20), distance: 'Half', isTarget: true };
    getResolvedBlocks.mockResolvedValueOnce({ race, set: null, blocks: [block], horizon: 'open', raceTooClose: true } as never);
    const tree = await render();
    expect(findElement(tree, Calendar)?.props.phase).toMatchObject({ raceName: 'Aarhus 70.3', daysToRace: 20 });
    expect(findElement(tree, BlockStrip)?.props.race).toEqual({ name: 'Aarhus 70.3', date: inDays(20) });
  });

  it('a target already run is neither named nor counted to', async () => {
    const race = { id: 'r1', name: 'Aarhus 70.3', date: inDays(-3), distance: 'Half', isTarget: true };
    getResolvedBlocks.mockResolvedValueOnce({ race, set: null, blocks: [block], horizon: 'open', raceTooClose: false } as never);
    const tree = await render();
    expect(findElement(tree, Calendar)?.props.phase).not.toHaveProperty('raceName');
    expect(findElement(tree, BlockStrip)?.props.race).toBeNull();
  });
});
