import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionInput } from '@/features/information-view/build-dataset';

const {
  getActiveLink,
  getAthleteName,
  getSharedTranscripts,
  getInformationViewInputs,
  getUnavailableDates,
  getHealthHistory,
  calendarRows,
} = vi.hoisted(() => ({
  getActiveLink: vi.fn(),
  getAthleteName: vi.fn(() => Promise.resolve('Mads')),
  getSharedTranscripts: vi.fn((): Promise<unknown> => Promise.resolve(null)),
  getInformationViewInputs: vi.fn(),
  getUnavailableDates: vi.fn(() => Promise.resolve([] as string[])),
  getHealthHistory: vi.fn(() =>
    Promise.resolve({
      injuries: [
        {
          id: 'inj_1', athleteId: 'a1', swim: 'full', bike: 'easy', run: 'none',
          openedAt: new Date('2026-08-01T08:00:00Z'), closedAt: null, bother: 3,
        },
      ],
      illnesses: [],
    }),
  ),
  calendarRows: { value: [] as unknown[] },
}));

/** An active Coaching Link with the given flags, as getActiveLink returns it. */
const activeLink = (
  shareAthleteReports: boolean,
  shareAiTranscripts: boolean,
) => ({
  id: 'l1',
  coachId: 'coach_1',
  athleteId: 'a1',
  status: 'active' as const,
  visibility: { shareAthleteReports, shareAiTranscripts },
});

// The calendar read is the service's one direct db query; the chain is thenable
// and resolves whatever the test queued in calendarRows.
function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const m of ['select', 'from', 'where', 'orderBy']) c[m] = () => c;
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(calendarRows.value).then(resolve);
  return c;
}

vi.mock('@/db', () => ({ getDb: () => chain() }));
const { getResolvedBlocks } = vi.hoisted(() => ({
  getResolvedBlocks: vi.fn(async (): Promise<unknown> => ({ race: null, set: null, blocks: [] })),
}));
vi.mock('./training-block-service', () => ({ getResolvedBlocks }));
const getAthleteById = vi.fn(async (): Promise<unknown> => ({ id: 'a1', profile: { weeklySessionDay: 'Wednesday' } }));
const getPendingWeekDraft = vi.fn<(athleteId: string, weekStart: string, options?: unknown) => Promise<unknown>>(async () => null);
const getRoster = vi.fn(async (): Promise<unknown[]> => []);
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteById }));
vi.mock('./week-draft-repository', () => ({ getPendingWeekDraft }));
// The in-flight draft (training-architecture/29): nothing in flight by default.
const draftInFlight = vi.fn(async (): Promise<unknown> => null);
vi.mock('./week-draft-service', () => ({ draftInFlight }));
vi.mock('./coach-repository', () => ({
  getRoster,
  getActiveLink,
  getAthleteName,
  getSharedTranscripts,
}));
vi.mock('@/features/information-view/information-view-repository', () => ({
  getInformationViewInputs,
}));
vi.mock('@/features/availability/availability-repository', () => ({
  getUnavailableDates,
}));
vi.mock('@/features/health/health-repository', () => ({ getHealthHistory }));

const { getCoachAthleteView } = await import('./roster-service');

const TODAY = '2026-07-14';

const calRow = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  athleteId: 'a1',
  date: '2026-07-13',
  type: 'Endurance',
  origin: 'coach',
  status: 'completed',
  parked: false,
  isTraining: true,
  duration: 60,
  zone: 'Zone 2',
  note: 'steady',
  title: 'Ride',
  dayOrder: 0,
  startTime: null,
  sport: null,
  summary: null,
  feedbackBody: 4,
  feedbackMind: 5,
  feedbackComment: 'felt strong',
  ratedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const ivInput = (over: Partial<SessionInput> = {}): SessionInput => ({
  id: 's1',
  date: '2026-07-13',
  status: 'completed',
  isTraining: true,
  type: 'Endurance',
  title: 'Ride',
  duration: 60,
  sport: null,
  summary: null,
  feedbackBody: 4,
  feedbackMind: 5,
  feedbackComment: 'felt strong',
  ...over,
});

beforeEach(() => {
  getActiveLink.mockReset();
  getAthleteName.mockClear();
  getInformationViewInputs.mockReset();
  getUnavailableDates.mockClear();
  getUnavailableDates.mockResolvedValue([]);
  getSharedTranscripts.mockClear();
  getSharedTranscripts.mockResolvedValue(null);
  getHealthHistory.mockClear();
  calendarRows.value = [];
});

describe('getCoachAthleteView — the health layer (training-architecture/06)', () => {
  it('reports off: health is null and nothing is fetched — not fetched-then-hidden', async () => {
    // Null, never `[]`: a coach who could tell "no injuries" from "not shared"
    // could infer health state from absence. Same discipline as transcripts.
    getActiveLink.mockResolvedValue(activeLink(false, false));
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: [] });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(view!.health).toBeNull();
    expect(getHealthHistory).not.toHaveBeenCalled();
  });

  it('reports on: the spans reach the view, open and closed alike', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: [] });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(getHealthHistory).toHaveBeenCalledWith('a1');
    expect(view!.health).toEqual([
      {
        kind: 'injury', id: 'inj_1', from: '2026-08-01', to: null,
        capacity: { swim: 'full', bike: 'easy', run: 'none' }, bother: 3,
      },
    ]);
  });
});

describe('getCoachAthleteView — the authorization gate', () => {
  it('refuses when there is no active link, reading nothing', async () => {
    getActiveLink.mockResolvedValue(undefined);

    const view = await getCoachAthleteView('coach_1', 'a_stranger', TODAY);

    expect(view).toBeNull();
    // The refusal is total: no athlete data is touched after the gate closes.
    expect(getInformationViewInputs).not.toHaveBeenCalled();
    expect(getAthleteName).not.toHaveBeenCalled();
    expect(getUnavailableDates).not.toHaveBeenCalled();
    expect(getSharedTranscripts).not.toHaveBeenCalled();
  });

  it('surfaces the athlete Unavailable Dates — the calendar is always visible', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: {} });
    getUnavailableDates.mockResolvedValue(['2026-07-20', '2026-07-21']);

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);
    expect(view!.unavailableDates).toEqual(['2026-07-20', '2026-07-21']);
  });

  it('revokes access on a severed link — indistinguishable from no link', async () => {
    // `getActiveLink` filters on status = active, so a severed link resolves to
    // undefined exactly as a nonexistent one does. Severing therefore revokes
    // through this same gate: the view is null and nothing is read (AC 7).
    getActiveLink.mockResolvedValue(undefined);

    expect(await getCoachAthleteView('coach_1', 'a_severed', TODAY)).toBeNull();
    expect(getInformationViewInputs).not.toHaveBeenCalled();
  });
});

describe('getCoachAthleteView — transcripts gated on share_ai_transcripts', () => {
  it('flag off: sharedTranscripts is null and getSharedTranscripts withholds', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: {} });
    // The repository is what enforces the gate; the service passes the link and
    // exposes whatever it returns — null when the flag is off.
    getSharedTranscripts.mockResolvedValue(null);

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(view!.sharedTranscripts).toBeNull();
    // The link (carrying the flag) is what the gate is applied to.
    expect(getSharedTranscripts).toHaveBeenCalledWith(activeLink(true, false));
  });

  it('flag on: the served transcripts reach the view', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, true));
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: {} });
    getSharedTranscripts.mockResolvedValue([
      { conversationId: 'c1', kind: 'coach_chat', createdAt: new Date('2026-07-01'), messages: [{ role: 'athlete', content: 'hi', seq: 0 }] },
    ]);

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(view!.sharedTranscripts).toHaveLength(1);
    expect(view!.sharedTranscripts![0].conversationId).toBe('c1');
  });
});

describe('getCoachAthleteView — Link Visibility applied server-side', () => {
  it('reports on: reflections reach the calendar and the Body & Mind panel', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    calendarRows.value = [calRow()];
    getInformationViewInputs.mockResolvedValue({ rows: [ivInput()], streams: {} });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(view!.calendarSessions[0].feedbackBody).toBe(4);
    // With a rating present, the Body & Mind panel has a reading.
    expect(view!.dataset.sessions[0].body).toBe(8); // 4 → RPE-axis ×2
  });

  it('the plan editing surface carries origin and the per-session editable guard', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    // A future coach-authored session (editable) and a future athlete session
    // (view-only). TODAY is 2026-07-14; both dated ahead so neither is past.
    calendarRows.value = [
      calRow({ id: 'plan', date: '2026-07-20', status: 'planned', origin: 'coach' }),
      calRow({ id: 'athletes', date: '2026-07-21', status: 'planned', origin: 'athlete' }),
    ];
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: {} });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(view!.planSessions.map((p) => [p.id, p.editable])).toEqual([
      ['plan', true],
      ['athletes', false],
    ]);
  });

  it('the plan editing surface excludes past and completed sessions', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    calendarRows.value = [
      calRow({ id: 'past', date: '2026-07-01', status: 'planned', origin: 'coach' }),
      calRow({ id: 'done', date: '2026-07-20', status: 'completed', origin: 'coach' }),
    ];
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: {} });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);
    expect(view!.planSessions).toHaveLength(0);
  });

  it('reports off: reflections are stripped before they leave the server', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, false));
    calendarRows.value = [calRow()];
    getInformationViewInputs.mockResolvedValue({ rows: [ivInput()], streams: {} });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    // The calendar still renders the plan, but carries no reflection.
    expect(view!.calendarSessions[0]).toMatchObject({
      type: 'Endurance',
      duration: 60,
      zone: 'Zone 2',
      status: 'completed',
      feedbackBody: null,
      feedbackMind: null,
      feedbackComment: null,
    });
    // The Body & Mind panel is gone, not empty — no session carries a reading.
    expect(view!.dataset.sessions.every((s) => s.body == null && s.mind == null)).toBe(true);
  });
});

describe('getCoachAthleteView — the Training Blocks are plan structure (training-architecture/08)', () => {
  const RACE = { id: 'r1', athleteId: 'a1', name: 'IM', date: '2027-08-15', distance: 'Ironman', isTarget: true, createdAt: new Date() };
  const BLOCKS = [
    { index: 1, total: 2, name: 'Build the Volume', startDate: '2026-09-14', endDate: '2027-01-10', authoredBy: 'coach_ai' },
    { index: 2, total: 2, name: 'Taper', startDate: '2027-01-11', endDate: '2027-08-15', authoredBy: 'coach_ai' },
  ];

  beforeEach(() => {
    calendarRows.value = [];
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: {} });
  });

  it('returns the blocks with the set version and race, regardless of shareAthleteReports', async () => {
    getResolvedBlocks.mockResolvedValue({
      race: RACE,
      set: { id: 's1', athleteId: 'a1', raceId: 'r1', startDate: '2026-09-14', version: 3, blocks: [] },
      blocks: BLOCKS,
    });

    for (const share of [true, false]) {
      getActiveLink.mockResolvedValue(activeLink(share, false));
      const view = await getCoachAthleteView('coach_1', 'a1', TODAY);
      expect(view!.blocks).toEqual({
        raceId: 'r1',
        raceName: 'IM',
        raceDate: '2027-08-15',
        version: 3,
        // An empty stored set fits no race, so the panel must not edit it.
        stale: true,
        startDate: '2026-09-14',
        blocks: BLOCKS,
      });
    }
    expect(getResolvedBlocks).toHaveBeenCalledWith('a1', TODAY);
  });

  it('carries version 0 and today as the start when nothing is stored yet — the arithmetic draft', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, false));
    getResolvedBlocks.mockResolvedValue({ race: RACE, set: null, blocks: BLOCKS });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(view!.blocks).toMatchObject({ version: 0, startDate: TODAY });
  });

  it('marks the view stale when the stored set no longer ends on race day, so the panel goes read-only', async () => {
    getResolvedBlocks.mockResolvedValue({
      race: RACE,
      set: { id: 's1', athleteId: 'a1', raceId: 'r1', startDate: '2026-09-14', version: 3, blocks: [{ name: 'Old Taper', endDate: '2027-08-01', authoredBy: 'coach_ai' }] },
      blocks: BLOCKS,
    });
    getActiveLink.mockResolvedValue(activeLink(true, false));

    const view = await getCoachAthleteView('c1', 'a1', TODAY);
    expect(view!.blocks).toMatchObject({ stale: true, version: 3 });
  });

  it('is not stale when the set fits the race, nor when nothing is stored', async () => {
    getResolvedBlocks.mockResolvedValue({
      race: RACE,
      set: { id: 's1', athleteId: 'a1', raceId: 'r1', startDate: '2026-09-14', version: 3, blocks: [{ name: 'Taper', endDate: '2027-08-15', authoredBy: 'coach_ai' }] },
      blocks: BLOCKS,
    });
    getActiveLink.mockResolvedValue(activeLink(true, false));
    expect((await getCoachAthleteView('c1', 'a1', TODAY))!.blocks).toMatchObject({ stale: false });

    getResolvedBlocks.mockResolvedValue({ race: RACE, set: null, blocks: BLOCKS });
    expect((await getCoachAthleteView('c1', 'a1', TODAY))!.blocks).toMatchObject({ stale: false });
  });

  it('is null when the athlete has no Target Race', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, true));
    getResolvedBlocks.mockResolvedValue({ race: null, set: null, blocks: [] });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(view!.blocks).toBeNull();
  });

  it('reads nothing when there is no link', async () => {
    getActiveLink.mockResolvedValue(undefined);
    getResolvedBlocks.mockClear();
    await getCoachAthleteView('coach_1', 'a_stranger', TODAY);
    expect(getResolvedBlocks).not.toHaveBeenCalled();
  });
});

describe('getCoachAthleteView — the editing surface starts today', () => {
  it('includes a session dated today and excludes yesterday and the completed', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    calendarRows.value = [
      calRow({ id: 'today', date: TODAY, status: 'planned', origin: 'coach' }),
      calRow({ id: 'yesterday', date: '2026-07-13', status: 'planned', origin: 'coach' }),
      calRow({ id: 'done', date: '2026-07-20', status: 'completed', origin: 'coach' }),
    ];
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: {} });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(view!.planSessions.map((p) => p.id)).toEqual(['today']);
  });
});

describe('getCoachAthleteView — the drafted week and its day are the Head Coach’s (training-architecture/17)', () => {
  const DRAFT = { id: 'd1', weekStart: '2026-09-21', visibleFrom: '2026-09-16', sessions: [], citations: [], approved: false, createdAt: new Date() };

  beforeEach(() => {
    calendarRows.value = [];
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: {} });
    getResolvedBlocks.mockResolvedValue({ race: null, set: null, blocks: [] });
    getAthleteById.mockResolvedValue({ id: 'a1', profile: { weeklySessionDay: 'Wednesday' } });
    getPendingWeekDraft.mockReset();
    getPendingWeekDraft.mockResolvedValue(null);
  });

  it('carries the athlete’s day and the pending draft a day early, regardless of shareAthleteReports', async () => {
    getPendingWeekDraft.mockResolvedValue(DRAFT);
    for (const share of [true, false]) {
      getActiveLink.mockResolvedValue(activeLink(share, false));
      // Tuesday 2026-09-15, athlete's day Wednesday: with the coach's one-day
      // lead the Wednesday cycle is current, so next week is what is reviewed.
      const view = await getCoachAthleteView('coach_1', 'a1', '2026-09-15');
      expect(view!.weeklySessionDay).toBe('Wednesday');
      expect(view!.pendingDraft).toEqual(DRAFT);
      expect(getPendingWeekDraft).toHaveBeenLastCalledWith('a1', '2026-09-21');
    }
  });

  it('reads with no asOf — the coach sees the preview the athlete cannot yet', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    await getCoachAthleteView('coach_1', 'a1', '2026-09-15');
    expect(getPendingWeekDraft.mock.calls[0]).toHaveLength(2);
  });

  it('is null day and null draft for an athlete with no profile and nothing pending', async () => {
    getAthleteById.mockResolvedValue({ id: 'a1', profile: null });
    getActiveLink.mockResolvedValue(activeLink(true, false));
    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);
    expect(view!.weeklySessionDay).toBeNull();
    expect(view!.pendingDraft).toBeNull();
  });
});

describe('getCoachAthleteView.draftInFlight — the preview area says a draft is coming (training-architecture/29)', () => {
  // Tuesday 2026-09-15, athlete's day Wednesday, one-day lead: the coach
  // previews 2026-09-21, as the pendingDraft tests above read it.
  const PREVIEW_WEEK = '2026-09-21';
  const THIS_WEEK = '2026-09-14';

  beforeEach(() => {
    calendarRows.value = [];
    getInformationViewInputs.mockResolvedValue({ rows: [], streams: {} });
    getResolvedBlocks.mockResolvedValue({ race: null, set: null, blocks: [] });
    getAthleteById.mockResolvedValue({ id: 'a1', profile: { weeklySessionDay: 'Wednesday' } });
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getPendingWeekDraft.mockReset();
    getPendingWeekDraft.mockResolvedValue(null);
    draftInFlight.mockReset();
    draftInFlight.mockResolvedValue(null);
  });

  it('set when no draft is pending and the in-flight week is the one the coach previews', async () => {
    draftInFlight.mockResolvedValue({ weekStart: PREVIEW_WEEK, visibleFrom: '2026-09-16', expectedSeconds: 30 });
    const view = await getCoachAthleteView('coach_1', 'a1', '2026-09-15');
    expect(view!.draftInFlight).toEqual({ weekStart: PREVIEW_WEEK });
    expect(draftInFlight).toHaveBeenCalledWith('a1', '2026-09-15');
  });

  it('null when a draft is pending — and the gate is not even asked', async () => {
    getPendingWeekDraft.mockResolvedValue({ id: 'd1', weekStart: PREVIEW_WEEK, visibleFrom: '2026-09-16', sessions: [], citations: [], approved: false, createdAt: new Date() });
    const view = await getCoachAthleteView('coach_1', 'a1', '2026-09-15');
    expect(view!.draftInFlight).toBeNull();
    expect(draftInFlight).not.toHaveBeenCalled();
  });

  it('null when nothing is in flight, and when the in-flight week is this week’s remainder, which the coach page does not preview', async () => {
    expect((await getCoachAthleteView('coach_1', 'a1', '2026-09-15'))!.draftInFlight).toBeNull();
    draftInFlight.mockResolvedValue({ weekStart: THIS_WEEK, visibleFrom: '2026-09-15', expectedSeconds: 30 });
    expect((await getCoachAthleteView('coach_1', 'a1', '2026-09-15'))!.draftInFlight).toBeNull();
  });
});

describe('getRosterWithReviews', () => {
  it('marks an athlete whose drafted week is still waiting for the coach, and not one already approved or with nothing pending', async () => {
    const { getRosterWithReviews } = await import('./roster-service');
    getRoster.mockResolvedValue([
      { athleteId: 'a1', name: 'Anna', link: activeLink(true, false) },
      { athleteId: 'a2', name: 'Bo', link: activeLink(true, false) },
      { athleteId: 'a3', name: 'Cy', link: activeLink(true, false) },
    ]);
    getPendingWeekDraft.mockImplementation(async (athleteId: string) =>
      athleteId === 'a1'
        ? { id: 'd', weekStart: '2026-09-21', visibleFrom: '2026-09-16', sessions: [], citations: [], approved: false, createdAt: new Date() }
        : athleteId === 'a2'
          ? { id: 'a', weekStart: '2026-09-21', visibleFrom: '2026-09-16', sessions: [], citations: [], approved: true, createdAt: new Date() }
          : null,
    );
    const roster = await getRosterWithReviews('coach_1', '2026-09-15');
    expect(roster.map((r) => [r.name, r.awaitingReview])).toEqual([
      ['Anna', true],
      ['Bo', false],
      ['Cy', false],
    ]);
  });
});

describe('storedDayOf / awaitsReview — the two small reads the roster leans on', () => {
  it('reads the day through a missing row, a null profile and an unset field as null', async () => {
    const { storedDayOf, awaitsReview } = await import('./roster-service');
    expect(storedDayOf(undefined)).toBeNull();
    expect(storedDayOf({ profile: null })).toBeNull();
    expect(storedDayOf({ profile: {} })).toBeNull();
    expect(storedDayOf({ profile: { weeklySessionDay: 'Friday' } })).toBe('Friday');
    const base = { id: 'd', weekStart: '2026-09-21', visibleFrom: '2026-09-16', sessions: [], citations: [], createdAt: new Date() };
    expect(awaitsReview(null)).toBe(false);
    expect(awaitsReview({ ...base, approved: true })).toBe(false);
    expect(awaitsReview({ ...base, approved: false })).toBe(true);
  });

  it('a roster entry whose athlete row is missing reads as Sunday and nothing waiting', async () => {
    const { getRosterWithReviews } = await import('./roster-service');
    getRoster.mockResolvedValue([{ athleteId: 'gone', name: 'Ghost', link: activeLink(true, false) }]);
    getAthleteById.mockResolvedValue(undefined);
    getPendingWeekDraft.mockResolvedValue(null);
    const roster = await getRosterWithReviews('coach_1', '2026-09-15');
    expect(roster[0].awaitingReview).toBe(false);
    // Sunday cycle with a one-day lead on Tuesday the 15th: last Sunday's week — this one.
    expect(getPendingWeekDraft).toHaveBeenLastCalledWith('gone', '2026-09-14');
  });
});
