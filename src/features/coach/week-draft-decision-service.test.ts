import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const getUnavailableDates = vi.fn();
const replaceCoachPlanForDateRange = vi.fn();
const recordProposal = vi.fn();
const getCalendarProposalState = vi.fn();
const recordWeekDraftDecision = vi.fn();
const recordWeekDraftDiscussed = vi.fn();
const getLatestOpenConversation = vi.fn();
const createConversation = vi.fn();
const getMessages = vi.fn();

vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates }));
vi.mock('@/features/session/session-repository', () => ({ replaceCoachPlanForDateRange }));
vi.mock('./plan-proposal-repository', () => ({ recordProposal }));
vi.mock('./conversation-repository', () => ({ getLatestOpenConversation, createConversation, getMessages }));
vi.mock('./week-draft-repository', () => ({ getCalendarProposalState, recordWeekDraftDecision, recordWeekDraftDiscussed }));

const { acceptWeekDraft, declineWeekDraft, discussWeekDraft, pastDaysOf } = await import('./week-draft-decision-service');

const ATHLETE = { id: 'athlete_1', profile: { fixedConstraints: ['Thursday'] } } as never;
const WEEK = '2026-09-21';
const SESSIONS = [
  { date: '2026-09-21', type: 'Endurance' as const, durationMinutes: 45, zone: 'Z2', note: 'easy' },
  { date: '2026-09-22', type: 'Intensity' as const, durationMinutes: 45, zone: 'Z4', note: 'intervals' },
  { date: '2026-09-25', type: 'Endurance' as const, durationMinutes: 60, zone: 'Z2', note: null },
  { date: '2026-09-27', type: 'Endurance' as const, durationMinutes: 150, zone: 'Z2', note: 'long' },
];
const DRAFT = { id: 'd1', weekStart: WEEK, visibleFrom: '2026-09-16', sessions: SESSIONS, citations: [], approved: false, createdAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  getUnavailableDates.mockResolvedValue([]);
  replaceCoachPlanForDateRange.mockResolvedValue(undefined);
  recordWeekDraftDecision.mockResolvedValue(undefined);
  recordWeekDraftDiscussed.mockResolvedValue(undefined);
  recordProposal.mockResolvedValue(undefined);
  getCalendarProposalState.mockResolvedValue({ kind: 'proposal', draft: DRAFT });
  getLatestOpenConversation.mockResolvedValue(null);
  createConversation.mockResolvedValue({ id: 'chat_new', kind: 'coach_chat' });
  getMessages.mockResolvedValue([]);
});

describe('acceptWeekDraft', () => {
  it('refuses not-found when the id is not the visible pending draft, writing nothing', async () => {
    getCalendarProposalState.mockResolvedValue({ kind: 'proposal', draft: { ...DRAFT, id: 'd2' } });
    expect(await acceptWeekDraft(ATHLETE, 'd1', '2026-09-18')).toEqual({ ok: false, reason: 'not-found' });
    getCalendarProposalState.mockResolvedValue({ kind: 'discussing', conversationId: 'c1', weekStart: WEEK });
    expect(await acceptWeekDraft(ATHLETE, 'd1', '2026-09-18')).toEqual({ ok: false, reason: 'not-found' });
    getCalendarProposalState.mockResolvedValue(null);
    expect(await acceptWeekDraft(ATHLETE, 'd1', '2026-09-18')).toEqual({ ok: false, reason: 'not-found' });
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
    expect(recordWeekDraftDecision).not.toHaveBeenCalled();
  });

  it('writes every session over the whole week and records the decision with the week and the draft', async () => {
    const result = await acceptWeekDraft(ATHLETE, 'd1', '2026-09-18');
    expect(result).toEqual({ ok: true, written: 4, pastDays: 0, start: WEEK, end: '2026-09-27' });
    expect(replaceCoachPlanForDateRange).toHaveBeenCalledTimes(1);
    const [athleteId, start, end, rows] = replaceCoachPlanForDateRange.mock.calls[0];
    expect([athleteId, start, end]).toEqual(['athlete_1', WEEK, '2026-09-27']);
    expect(rows.map((r: { date: string; status: string; origin: string }) => [r.date, r.status, r.origin])).toEqual(
      SESSIONS.map((s) => [s.date, 'planned', 'coach']),
    );
    expect(recordWeekDraftDecision).toHaveBeenCalledWith({
      athleteId: 'athlete_1',
      type: 'week_plan_written',
      weekStart: WEEK,
      draftId: 'd1',
      sessions: SESSIONS,
    });
  });

  it('accepted after its Monday, writes the whole week as drafted — past days planned, never skipped — and says how many', async () => {
    // Wednesday the 23rd: Monday and Tuesday are gone.
    const result = await acceptWeekDraft(ATHLETE, 'd1', '2026-09-23');
    expect(result).toEqual({ ok: true, written: 4, pastDays: 2, start: WEEK, end: '2026-09-27' });
    const rows = replaceCoachPlanForDateRange.mock.calls[0][3] as { date: string; status: string }[];
    expect(rows.map((r) => r.date)).toEqual(['2026-09-21', '2026-09-22', '2026-09-25', '2026-09-27']);
    expect(rows.every((r) => r.status === 'planned')).toBe(true);
    expect(rows.some((r) => r.status === 'skipped')).toBe(false);
  });

  it('refuses invalid, writing nothing, when a session sits on a day the athlete ruled out', async () => {
    getUnavailableDates.mockResolvedValue(['2026-09-22']);
    expect(await acceptWeekDraft(ATHLETE, 'd1', '2026-09-18')).toEqual({ ok: false, reason: 'invalid' });
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
    expect(recordWeekDraftDecision).not.toHaveBeenCalled();
  });

  it('a recurring no-train day counts too, and an all-excluded week is refused rather than emptied', async () => {
    getCalendarProposalState.mockResolvedValue({
      kind: 'proposal',
      draft: { ...DRAFT, sessions: [{ ...SESSIONS[0], date: '2026-09-24' }] },
    });
    expect(await acceptWeekDraft(ATHLETE, 'd1', '2026-09-18')).toEqual({ ok: false, reason: 'invalid' });
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
  });
});

describe('acceptWeekDraft — an athlete with no profile', () => {
  it('has no recurring no-train days, so every drafted day is accepted', async () => {
    const result = await acceptWeekDraft({ id: 'athlete_1', profile: null } as never, 'd1', '2026-09-18');
    expect(result).toMatchObject({ ok: true, written: 4 });
  });
});

describe('pastDaysOf', () => {
  it('counts distinct days before today, not sessions', () => {
    expect(pastDaysOf(SESSIONS, '2026-09-23')).toBe(2);
    expect(pastDaysOf([...SESSIONS, { ...SESSIONS[0], type: 'Recovery' }], '2026-09-23')).toBe(2);
    expect(pastDaysOf(SESSIONS, '2026-09-21')).toBe(0);
    expect(pastDaysOf(SESSIONS, '2026-09-28')).toBe(4);
  });
});

describe('declineWeekDraft', () => {
  it('records the decline for the week and writes nothing to the calendar', async () => {
    expect(await declineWeekDraft(ATHLETE, 'd1', '2026-09-18')).toEqual({ ok: true });
    expect(recordWeekDraftDecision).toHaveBeenCalledWith({
      athleteId: 'athlete_1',
      type: 'week_plan_declined',
      weekStart: WEEK,
      draftId: 'd1',
      sessions: [],
    });
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
  });

  it('refuses not-found for a stale id', async () => {
    getCalendarProposalState.mockResolvedValue(null);
    expect(await declineWeekDraft(ATHLETE, 'd1', '2026-09-18')).toEqual({ ok: false, reason: 'not-found' });
    expect(recordWeekDraftDecision).not.toHaveBeenCalled();
  });
});

describe('discussWeekDraft — the draft goes to the one conversation (training-architecture/20)', () => {
  it('reuses the open Coach Chat, stages the draft as its proposal, records the handoff against it, and calls no Coach', async () => {
    getLatestOpenConversation.mockResolvedValue({ id: 'chat1', kind: 'coach_chat' });
    const transcript = [{ id: 'm1', role: 'athlete', content: 'hi', seq: 1, citations: [], createdAt: new Date() }];
    getMessages.mockResolvedValue(transcript);

    const result = await discussWeekDraft(ATHLETE, 'd1', '2026-09-18');

    expect(getLatestOpenConversation).toHaveBeenCalledWith('athlete_1', 'coach_chat');
    expect(result).toEqual({ ok: true, conversationId: 'chat1', messages: transcript, proposal: { sessions: SESSIONS } });
    expect(recordProposal).toHaveBeenCalledWith('athlete_1', 'chat1', SESSIONS);
    expect(recordWeekDraftDiscussed).toHaveBeenCalledWith({ athleteId: 'athlete_1', weekStart: WEEK, draftId: 'd1', conversationId: 'chat1' });
    expect(createConversation).not.toHaveBeenCalled();
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
  });

  it('mints a Coach Chat when the athlete has none open', async () => {
    const result = await discussWeekDraft(ATHLETE, 'd1', '2026-09-18');

    expect(createConversation).toHaveBeenCalledWith({ athleteId: 'athlete_1', kind: 'coach_chat' });
    expect(result).toMatchObject({ ok: true, conversationId: 'chat_new', messages: [] });
    expect(recordWeekDraftDiscussed).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'chat_new' }));
  });

  it('refuses not-found for a stale id before touching any conversation', async () => {
    getCalendarProposalState.mockResolvedValue(null);
    expect(await discussWeekDraft(ATHLETE, 'd1', '2026-09-18')).toEqual({ ok: false, reason: 'not-found' });
    expect(getLatestOpenConversation).not.toHaveBeenCalled();
    expect(createConversation).not.toHaveBeenCalled();
    expect(recordProposal).not.toHaveBeenCalled();
    expect(recordWeekDraftDiscussed).not.toHaveBeenCalled();
  });
});

describe('the one writer', () => {
  it('this module is the only week-draft module that reaches the calendar', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const read = (f: string) => readFileSync(`${here}/${f}`, 'utf8');
    expect(read('week-draft-decision-service.ts')).toMatch(/replaceCoachPlanForDateRange/);
    // And it never calls the Coach: Discuss hands the draft over, the next
    // turn is the athlete's (training-architecture/20).
    expect(read('week-draft-decision-service.ts')).not.toMatch(/weekly-session-service|callCoach|coach-client/);
    for (const f of ['week-draft.ts', 'week-draft-repository.ts', 'week-draft-service.ts', 'head-coach-week-service.ts']) {
      expect(read(f), f).not.toMatch(/replaceCoachPlanForDateRange/);
    }
  });
});
