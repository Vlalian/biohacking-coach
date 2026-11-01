import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WeekDraft } from './week-draft';

const { previewRefill, refillWeeksFromHours, draftInFlight, getPendingWeekDraft, withdrawWeekDraft, recordHoursChanged, updateHoursPerWeek, getSessionsForWeek } =
  vi.hoisted(() => ({
    previewRefill: vi.fn(),
    refillWeeksFromHours: vi.fn(),
    draftInFlight: vi.fn(),
    getPendingWeekDraft: vi.fn(),
    withdrawWeekDraft: vi.fn(),
    recordHoursChanged: vi.fn(),
    updateHoursPerWeek: vi.fn(),
    getSessionsForWeek: vi.fn(),
  }));

vi.mock('./block-fill-service', () => ({ previewRefill, refillWeeksFromHours }));
vi.mock('./week-draft-service', () => ({ draftInFlight }));
vi.mock('./week-draft-repository', () => ({ getPendingWeekDraft, withdrawWeekDraft, recordHoursChanged }));
vi.mock('@/features/athlete/athlete-repository', () => ({ updateHoursPerWeek }));
vi.mock('@/features/session/session-repository', () => ({ getSessionsForWeek }));

const { previewHoursChange, applyHoursChange } = await import('./hours-change-service');

// 2026-09-30 is a Wednesday in ISO week 40.
const TODAY = '2026-09-30';
const W41 = '2026-10-05';
const W42 = '2026-10-12';

const draft = (over: Partial<WeekDraft> = {}): WeekDraft => ({
  id: 'd41',
  weekStart: W41,
  visibleFrom: TODAY,
  sessions: [],
  citations: [],
  approved: false,
  createdAt: new Date('2026-09-28T08:00:00Z'),
  ...over,
});
const waitingIn = (week: string, d: WeekDraft = draft({ weekStart: week })) =>
  getPendingWeekDraft.mockImplementation(async (_id: string, w: string) => (w === week ? d : null));

beforeEach(() => {
  vi.clearAllMocks();
  previewRefill.mockResolvedValue([]);
  draftInFlight.mockResolvedValue(null);
  getPendingWeekDraft.mockResolvedValue(null);
  getSessionsForWeek.mockResolvedValue([]);
  refillWeeksFromHours.mockResolvedValue({ outcome: 'refilled', weeks: [] });
});

describe('previewHoursChange', () => {
  it('finds the waiting draft in next week, coach preview included, and asks the redraw', async () => {
    previewRefill.mockResolvedValue([W41, W42]);
    waitingIn(W41, draft());

    expect(await previewHoursChange('athlete_1', TODAY)).toEqual({ kind: 'choose', waitingWeek: W41, weeks: [W41, W42], weeksIfKept: [W42] });
    expect(getPendingWeekDraft).toHaveBeenCalledWith('athlete_1', W41);
    expect(previewRefill).toHaveBeenCalledWith('athlete_1', TODAY);
    expect(draftInFlight).toHaveBeenCalledWith('athlete_1', TODAY);
  });

  it('looks one week further when next week has none, and names an accepted next week', async () => {
    previewRefill.mockResolvedValue([W42]);
    waitingIn(W42);
    expect(await previewHoursChange('athlete_1', TODAY)).toMatchObject({ kind: 'choose', waitingWeek: W42 });

    getPendingWeekDraft.mockResolvedValue(null);
    getSessionsForWeek.mockResolvedValue([{ origin: 'coach', status: 'planned' }]);
    expect(await previewHoursChange('athlete_1', TODAY)).toEqual({ kind: 'confirm', weeks: [W42], plannedWeek: W41 });
    expect(getSessionsForWeek).toHaveBeenCalledWith('athlete_1', W41);
  });

  it('waits while Momentum is writing an upcoming week', async () => {
    draftInFlight.mockResolvedValue({ weekStart: W41, visibleFrom: W41, expectedSeconds: 30 });
    expect(await previewHoursChange('athlete_1', TODAY)).toEqual({ kind: 'drafting', week: W41 });
  });
});

describe('applyHoursChange', () => {
  it('start from the waiting week: stores, redraws it with the rest, withdraws its draft, and names it to draft again', async () => {
    waitingIn(W41, draft());
    refillWeeksFromHours.mockResolvedValue({ outcome: 'refilled', weeks: [W41, W42] });

    expect(await applyHoursChange('athlete_1', 10, 'waiting-week', TODAY)).toEqual({ redrawn: [W41, W42], redraft: W41 });
    expect(updateHoursPerWeek).toHaveBeenCalledWith('athlete_1', 10);
    expect(refillWeeksFromHours).toHaveBeenCalledWith('athlete_1', TODAY);
    expect(withdrawWeekDraft).toHaveBeenCalledWith('athlete_1', expect.objectContaining({ id: 'd41', weekStart: W41 }), 'hours-changed');
    expect(recordHoursChanged).toHaveBeenCalledWith('athlete_1', { hours: 10, keptWeek: null });
  });

  it.each([
    ['week-after', TODAY],
    // In the coach's preview: the server keeps it whatever the client asked.
    ['waiting-week', '2026-10-01'],
  ] as const)('%s keeps the draft decidable and redraws the other weeks', async (startFrom, visibleFrom) => {
    waitingIn(W41, draft({ visibleFrom }));
    refillWeeksFromHours.mockResolvedValue({ outcome: 'refilled', weeks: [W42] });

    expect(await applyHoursChange('athlete_1', 10, startFrom, TODAY)).toEqual({ redrawn: [W42], redraft: null });
    expect(refillWeeksFromHours).toHaveBeenCalledWith('athlete_1', TODAY, { except: W41 });
    expect(withdrawWeekDraft).not.toHaveBeenCalled();
    expect(recordHoursChanged).toHaveBeenCalledWith('athlete_1', { hours: 10, keptWeek: W41 });
  });

  it('with no waiting draft, redraws everything due and keeps nothing', async () => {
    refillWeeksFromHours.mockResolvedValue({ outcome: 'refilled', weeks: [W41, W42] });

    expect(await applyHoursChange('athlete_1', 10, 'waiting-week', TODAY)).toEqual({ redrawn: [W41, W42], redraft: null });
    expect(refillWeeksFromHours).toHaveBeenCalledWith('athlete_1', TODAY);
    expect(withdrawWeekDraft).not.toHaveBeenCalled();
    expect(recordHoursChanged).toHaveBeenCalledWith('athlete_1', { hours: 10, keptWeek: null });
  });
});
