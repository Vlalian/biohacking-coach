import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionInput } from '@/features/information-view/build-dataset';

const {
  getActiveLink,
  getAthleteName,
  getSharedTranscripts,
  getInformationViewInputs,
  getUnavailableDates,
  calendarRows,
} = vi.hoisted(() => ({
  getActiveLink: vi.fn(),
  getAthleteName: vi.fn(() => Promise.resolve('Mads')),
  getSharedTranscripts: vi.fn((): Promise<unknown> => Promise.resolve(null)),
  getInformationViewInputs: vi.fn(),
  getUnavailableDates: vi.fn(() => Promise.resolve([] as string[])),
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
vi.mock('./coach-repository', () => ({
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
  calendarRows.value = [];
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
