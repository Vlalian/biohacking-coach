import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionInput } from '@/features/information-view/build-dataset';

const {
  getActiveLink,
  getAthleteName,
  getInformationViewInputs,
  getUnavailableDates,
  calendarRows,
} = vi.hoisted(() => ({
  getActiveLink: vi.fn(),
  getAthleteName: vi.fn(() => Promise.resolve('Mads')),
  getInformationViewInputs: vi.fn(),
  getUnavailableDates: vi.fn(() => Promise.resolve([] as string[])),
  calendarRows: { value: [] as unknown[] },
}));

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
vi.mock('./coach-repository', () => ({ getActiveLink, getAthleteName }));
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
  });

  it('surfaces the athlete Unavailable Dates — the calendar is always visible', async () => {
    getActiveLink.mockResolvedValue({ shareAthleteReports: true, shareAiTranscripts: false });
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

describe('getCoachAthleteView — transcripts are never in the payload', () => {
  it('the share_ai_transcripts flag changes nothing: no transcript reaches the view either way', async () => {
    // The guarantee is by construction — this view reads only sessions and
    // streams, never conversations or messages — so the flag cannot add or
    // remove a transcript. Proven by flipping it and getting identical,
    // transcript-free output (AC 3).
    calendarRows.value = [calRow()];
    getInformationViewInputs.mockResolvedValue({ rows: [ivInput()], streams: {} });

    getActiveLink.mockResolvedValue({ shareAthleteReports: true, shareAiTranscripts: false });
    const withheld = await getCoachAthleteView('coach_1', 'a1', TODAY);

    getActiveLink.mockResolvedValue({ shareAthleteReports: true, shareAiTranscripts: true });
    const shared = await getCoachAthleteView('coach_1', 'a1', TODAY);

    // The view shape carries no transcript field at all, on either setting.
    expect(withheld).not.toHaveProperty('transcripts');
    expect(withheld).not.toHaveProperty('messages');
    expect(shared).not.toHaveProperty('transcripts');
    // Flipping the flag leaves the data identical — there is no transcript path.
    expect(shared!.calendarSessions).toEqual(withheld!.calendarSessions);
    expect(shared!.dataset).toEqual(withheld!.dataset);
  });
});

describe('getCoachAthleteView — Link Visibility applied server-side', () => {
  it('reports on: reflections reach the calendar and the Body & Mind panel', async () => {
    getActiveLink.mockResolvedValue({ shareAthleteReports: true, shareAiTranscripts: false });
    calendarRows.value = [calRow()];
    getInformationViewInputs.mockResolvedValue({ rows: [ivInput()], streams: {} });

    const view = await getCoachAthleteView('coach_1', 'a1', TODAY);

    expect(view!.calendarSessions[0].feedbackBody).toBe(4);
    // With a rating present, the Body & Mind panel has a reading.
    expect(view!.dataset.sessions[0].body).toBe(8); // 4 → RPE-axis ×2
  });

  it('reports off: reflections are stripped before they leave the server', async () => {
    getActiveLink.mockResolvedValue({ shareAthleteReports: false, shareAiTranscripts: false });
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
