import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const getActiveLink = vi.fn();
const getAthleteById = vi.fn();
const mergeAthleteProfile = vi.fn();
const insertValues = vi.fn((values?: Record<string, unknown>) => Promise.resolve({ values }));
const getPendingWeekDraft = vi.fn();
const recordWeekDraftApproval = vi.fn();

vi.mock('@/db', () => ({ getDb: () => ({ insert: () => ({ values: insertValues }) }) }));
vi.mock('./coach-repository', () => ({ getActiveLink }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteById, mergeAthleteProfile }));
vi.mock('./week-draft-repository', () => ({ getPendingWeekDraft, recordWeekDraftApproval }));

const { setWeeklySessionDayAsHeadCoach, approveWeekDraft } = await import('./head-coach-week-service');

const COACH = 'coach_1';
const ATHLETE = 'athlete_1';
const LINK = { id: 'l1', coachId: COACH, athleteId: ATHLETE, status: 'active' };
// 2026-09-16 is a Wednesday; the draft is for the week after.
const TODAY = '2026-09-16';
const WEEK = '2026-09-21';
const SESSIONS = [
  { date: '2026-09-22', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy' },
  { date: '2026-09-27', type: 'Endurance', durationMinutes: 150, zone: 'Z2', note: 'long' },
];
const DRAFT = {
  id: 'd1',
  weekStart: WEEK,
  visibleFrom: '2026-09-17',
  sessions: SESSIONS,
  citations: [{ sourceId: 's1' }],
  approved: false,
  createdAt: new Date('2026-09-16T06:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  getActiveLink.mockResolvedValue(LINK);
  getAthleteById.mockResolvedValue({ id: ATHLETE, profile: { weeklySessionDay: 'Wednesday' } });
  mergeAthleteProfile.mockResolvedValue(undefined);
  getPendingWeekDraft.mockResolvedValue(DRAFT);
  recordWeekDraftApproval.mockResolvedValue(undefined);
});

describe('setWeeklySessionDayAsHeadCoach', () => {
  it('refuses not-linked and writes nothing — not the profile, not an event', async () => {
    getActiveLink.mockResolvedValue(undefined);
    expect(await setWeeklySessionDayAsHeadCoach({ headCoachId: COACH, athleteId: ATHLETE, day: 'Sunday' })).toEqual({
      ok: false,
      reason: 'not-linked',
    });
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('refuses Flexible and anything that is not a weekday', async () => {
    for (const day of ['Flexible', 'Someday', '']) {
      expect(await setWeeklySessionDayAsHeadCoach({ headCoachId: COACH, athleteId: ATHLETE, day })).toEqual({
        ok: false,
        reason: 'invalid',
      });
    }
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
  });

  it('writes the day and a head_coach event carrying from and to, attributed to the acting coach', async () => {
    expect(await setWeeklySessionDayAsHeadCoach({ headCoachId: COACH, athleteId: ATHLETE, day: 'Sunday' })).toEqual({ ok: true });
    expect(mergeAthleteProfile).toHaveBeenCalledWith(ATHLETE, { weeklySessionDay: 'Sunday' });
    expect(insertValues).toHaveBeenCalledWith({
      athleteId: ATHLETE,
      actorType: 'head_coach',
      actorId: COACH,
      type: 'weekly_session_day_set',
      payload: { from: 'Wednesday', to: 'Sunday' },
    });
  });

  it('records a null "from" when no day was stored, or no athlete row could be read', async () => {
    getAthleteById.mockResolvedValueOnce(undefined);
    await setWeeklySessionDayAsHeadCoach({ headCoachId: COACH, athleteId: ATHLETE, day: 'Monday' });
    expect(insertValues.mock.calls[0][0]).toMatchObject({ payload: { from: null, to: 'Monday' } });
    insertValues.mockClear();
    getAthleteById.mockResolvedValue({ id: ATHLETE, profile: null });
    await setWeeklySessionDayAsHeadCoach({ headCoachId: COACH, athleteId: ATHLETE, day: 'Monday' });
    expect(insertValues.mock.calls[0][0]).toMatchObject({ payload: { from: null, to: 'Monday' } });
  });
});

describe('approveWeekDraft', () => {
  const approve = (over: Partial<Parameters<typeof approveWeekDraft>[0]> = {}) =>
    approveWeekDraft({ headCoachId: COACH, athleteId: ATHLETE, draftId: 'd1', weekStart: WEEK, sessions: SESSIONS, today: TODAY, ...over });

  it('refuses not-linked before reading anything', async () => {
    getActiveLink.mockResolvedValue(undefined);
    expect(await approve()).toEqual({ ok: false, reason: 'not-linked' });
    expect(getPendingWeekDraft).not.toHaveBeenCalled();
    expect(recordWeekDraftApproval).not.toHaveBeenCalled();
  });

  it('reads the coach-side draft — no asOf — and refuses stale when the id is no longer the pending one', async () => {
    getPendingWeekDraft.mockResolvedValue({ ...DRAFT, id: 'd2' });
    expect(await approve()).toEqual({ ok: false, reason: 'stale' });
    expect(getPendingWeekDraft).toHaveBeenCalledWith(ATHLETE, WEEK);
    getPendingWeekDraft.mockResolvedValue(null);
    expect(await approve()).toEqual({ ok: false, reason: 'stale' });
    expect(recordWeekDraftApproval).not.toHaveBeenCalled();
  });

  it('refuses invalid when an edited session falls outside the draft’s week, writing nothing', async () => {
    expect(await approve({ sessions: [{ ...SESSIONS[0], date: '2026-10-05' }] })).toEqual({ ok: false, reason: 'invalid' });
    expect(await approve({ sessions: 'nope' })).toEqual({ ok: false, reason: 'invalid' });
    expect(recordWeekDraftApproval).not.toHaveBeenCalled();
  });

  it('refuses invalid when the draft’s week has already ended — nothing left to plan', async () => {
    expect(await approve({ today: '2026-10-05' })).toEqual({ ok: false, reason: 'invalid' });
    expect(recordWeekDraftApproval).not.toHaveBeenCalled();
  });

  it('approves unchanged as changed: false, carrying the draft’s visibility and citations forward', async () => {
    expect(await approve()).toEqual({ ok: true, changed: false });
    expect(recordWeekDraftApproval).toHaveBeenCalledWith({
      athleteId: ATHLETE,
      headCoachId: COACH,
      draftId: 'd1',
      weekStart: WEEK,
      visibleFrom: '2026-09-17',
      sessions: SESSIONS,
      citations: [{ sourceId: 's1' }],
      changed: false,
    });
  });

  it('computes changed on the server: a different duration, note, zone, type, date, count or order all count', async () => {
    const variants: unknown[][] = [
      [{ ...SESSIONS[0], durationMinutes: 75 }, SESSIONS[1]],
      [{ ...SESSIONS[0], note: 'steady' }, SESSIONS[1]],
      [{ ...SESSIONS[0], zone: 'Z3' }, SESSIONS[1]],
      [{ ...SESSIONS[0], type: 'Recovery' }, SESSIONS[1]],
      [{ ...SESSIONS[0], date: '2026-09-23' }, SESSIONS[1]],
      [SESSIONS[0]],
      [SESSIONS[1], SESSIONS[0]],
    ];
    for (const sessions of variants) {
      recordWeekDraftApproval.mockClear();
      expect(await approve({ sessions })).toEqual({ ok: true, changed: true });
      expect(recordWeekDraftApproval.mock.calls[0][0]).toMatchObject({ changed: true });
    }
  });
});

describe('approval never reaches the calendar', () => {
  it('head-coach-week-service.ts imports neither the plan writer nor the sessions table', () => {
    const source = readFileSync(fileURLToPath(new URL('./head-coach-week-service.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/replaceCoachPlanForDateRange/);
    expect(source).not.toMatch(/\bsessions\b[^\n]*from '@\/db\/schema'/);
  });
});
