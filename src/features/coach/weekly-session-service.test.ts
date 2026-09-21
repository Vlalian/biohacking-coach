import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The athlete's decision on a proposed week — the server half of the Action
 * Proposal card, shared by every conversation that can stage one.
 *
 * This file used to cover the whole Weekly Session orchestration: opening a
 * session, continuing it, what the Coach was sent, the empty-turn bug Mads hit
 * on 2026-08-16. That behavior is retired (ADR 0007, amended 2026-09-16;
 * `training-architecture/21`) and its entry points are gone, so what is left
 * to hold to is what outlived it: confirming and cancelling a staged proposal,
 * ownership-scoped (ADR 0006) and bounded to the conversation's window.
 */

const {
  getOwnedConversation,
  getPendingProposal,
  recordPlanCommitted,
  endConversation,
  replaceCoachPlanForDateRange,
  getUnavailableDates,
  recordPlanDeclined,
} = vi.hoisted(() => ({
  getOwnedConversation: vi.fn(),
  getPendingProposal: vi.fn(),
  recordPlanCommitted: vi.fn(() => Promise.resolve()),
  endConversation: vi.fn(() => Promise.resolve()),
  replaceCoachPlanForDateRange: vi.fn(() => Promise.resolve()),
  getUnavailableDates: vi.fn(() => Promise.resolve([] as string[])),
  recordPlanDeclined: vi.fn(() => Promise.resolve()),
}));

vi.mock('./conversation-repository', () => ({ endConversation, getOwnedConversation }));
vi.mock('./plan-proposal-repository', () => ({
  getPendingProposal,
  recordPlanCommitted,
  recordPlanDeclined,
}));
vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates }));
const { getDiscussedWeek } = vi.hoisted(() => ({ getDiscussedWeek: vi.fn(async (): Promise<string | null> => null) }));
vi.mock('./week-draft-repository', () => ({ getDiscussedWeek }));
vi.mock('@/features/session/session-repository', () => ({ replaceCoachPlanForDateRange }));

const { commitWeeklyPlan, declineWeeklyPlan } = await import('./weekly-session-service');

const ATHLETE = {
  id: 'athlete_1',
  syntheticLabel: null,
  experienceLevel: 'intermediate',
  communicationStyle: null,
  raceTarget: 'Ironman Copenhagen',
  trainingSessionsPerWeek: null,
  profile: null,
} as unknown as Parameters<typeof commitWeeklyPlan>[0];

const TODAY = '2026-08-12';

beforeEach(() => {
  // An old `weekly_session` row by default: the kind nothing creates any more,
  // whose pending proposal the server must still answer for honestly.
  getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', kind: 'weekly_session', weeklySessionNumber: 2 });
  getDiscussedWeek.mockReset().mockResolvedValue(null);
  getPendingProposal.mockReset();
  recordPlanCommitted.mockClear();
  endConversation.mockClear();
  replaceCoachPlanForDateRange.mockClear();
  getUnavailableDates.mockReset().mockResolvedValue([]);
  recordPlanDeclined.mockClear();
});

describe('commitWeeklyPlan and the planning window', () => {
  // TODAY is 2026-08-12, a Wednesday; its week ends Sunday 2026-08-16.
  const INSIDE = {
    date: '2026-08-14',
    type: 'Endurance',
    durationMinutes: 60,
    zone: 'Z2',
    note: null,
  };
  const NEXT_WEEK = { ...INSIDE, date: '2026-08-17' };

  it('writes a proposal that lies inside the window', async () => {
    getPendingProposal.mockResolvedValue({ sessions: [INSIDE] });

    const result = await commitWeeklyPlan(ATHLETE, 'conv_1', TODAY);

    expect(result).toEqual({
      ok: true,
      sessionCount: 1,
      // The window, not the proposal's own span — see the test below.
      start: '2026-08-12',
      end: '2026-08-16',
    });
    expect(replaceCoachPlanForDateRange).toHaveBeenCalled();
  });

  it('clears the whole window, not only the days the proposal filled', async () => {
    // The bound has to reach the *write*, not just the validation. A proposal
    // covering one day used to replace one day, so a Coach session already
    // sitting on a window day the new plan omits survived a replace that was
    // meant to hand the athlete a fresh week — the model's choice of days
    // silently decided what got cleared. `showable-version/11`: the window is
    // one rule, and a rule that stops short of the write is a request.
    getPendingProposal.mockResolvedValue({ sessions: [INSIDE] });

    const result = await commitWeeklyPlan(ATHLETE, 'conv_1', TODAY);

    expect(result).toMatchObject({ ok: true, start: '2026-08-12', end: '2026-08-16' });
    expect(replaceCoachPlanForDateRange).toHaveBeenCalledWith(
      ATHLETE.id,
      '2026-08-12',
      '2026-08-16',
      expect.any(Array),
    );
  });

  it('refuses as stale a proposal that has drifted beyond the window', async () => {
    getPendingProposal.mockResolvedValue({ sessions: [INSIDE, NEXT_WEEK] });

    const result = await commitWeeklyPlan(ATHLETE, 'conv_1', TODAY);

    // Refused whole rather than committed shrunken: a week the athlete agreed to
    // is not the same week once a day of it is dropped, so they re-plan.
    expect(result).toEqual({ ok: false, reason: 'stale' });
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
    expect(recordPlanCommitted).not.toHaveBeenCalled();
  });

  it('refuses when Unavailable Dates have emptied the week since staging', async () => {
    getPendingProposal.mockResolvedValue({ sessions: [INSIDE] });
    // Every remaining day of the week is now off, so the window falls through to
    // next week and the staged session sits before its start.
    getUnavailableDates.mockResolvedValue([
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
    ]);

    const result = await commitWeeklyPlan(ATHLETE, 'conv_1', TODAY);

    expect(result).toEqual({ ok: false, reason: 'stale' });
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
  });
});

/**
 * The two decision endpoints: the athlete confirms the week, or they do not.
 * Both are ownership-scoped (ADR 0006) and both are reachable from a client,
 * so what they refuse matters as much as what they do.
 */
describe('declineWeeklyPlan', () => {
  it('refuses a conversation the athlete does not own, and writes nothing', async () => {
    getOwnedConversation.mockResolvedValue(null);

    expect(await declineWeeklyPlan(ATHLETE, 'conv_1')).toEqual({
      ok: false,
      reason: 'not-owner',
    });
    expect(getPendingProposal).not.toHaveBeenCalled();
    expect(recordPlanDeclined).not.toHaveBeenCalled();
  });

  it('marks a pending proposal declined and leaves the conversation open', async () => {
    getPendingProposal.mockResolvedValue({
      sessions: [
        { date: '2026-08-14', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
      ],
    });

    expect(await declineWeeklyPlan(ATHLETE, 'conv_1')).toEqual({ ok: true });
    expect(recordPlanDeclined).toHaveBeenCalledWith(ATHLETE.id, 'conv_1');
    // Declining is not ending: the athlete may keep talking or ask for another week.
    expect(endConversation).not.toHaveBeenCalled();
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
  });

  it('succeeds with nothing to decline when no proposal is pending', async () => {
    getPendingProposal.mockResolvedValue(null);

    expect(await declineWeeklyPlan(ATHLETE, 'conv_1')).toEqual({ ok: true });
    expect(recordPlanDeclined).not.toHaveBeenCalled();
  });
});

describe('commitWeeklyPlan — what it refuses', () => {
  it('refuses a conversation the athlete does not own', async () => {
    getOwnedConversation.mockResolvedValue(null);

    expect(await commitWeeklyPlan(ATHLETE, 'conv_1', TODAY)).toEqual({
      ok: false,
      reason: 'not-owner',
    });
    expect(getPendingProposal).not.toHaveBeenCalled();
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
  });

  it('refuses when there is nothing staged to commit', async () => {
    getPendingProposal.mockResolvedValue(null);

    expect(await commitWeeklyPlan(ATHLETE, 'conv_1', TODAY)).toEqual({
      ok: false,
      reason: 'no-proposal',
    });
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
  });

  it('ends an old weekly_session conversation once the week is written', async () => {
    getPendingProposal.mockResolvedValue({
      sessions: [
        { date: '2026-08-14', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
      ],
    });

    const result = await commitWeeklyPlan(ATHLETE, 'conv_1', TODAY);

    expect(result.ok).toBe(true);
    expect(recordPlanCommitted).toHaveBeenCalled();
    // The retired ritual was over once the week was agreed — an old row is
    // closed the way it always was, never left open.
    expect(endConversation).toHaveBeenCalled();
    // And its window is this week's remainder, never a discussed week's: the
    // handoff read belongs to Coach Chat alone (training-architecture/20).
    expect(getDiscussedWeek).not.toHaveBeenCalled();
  });
});

/**
 * The same commit path, reached from Coach Chat (`training-architecture/20`):
 * the window is the conversation's — the whole of a week brought in to
 * discuss, else this week's remainder — and the chat is never ended.
 */
describe('commitWeeklyPlan from Coach Chat', () => {
  // 2026-09-16 is a Wednesday: this week is 09-14..09-20, next is 09-21..09-27.
  const WED = '2026-09-16';
  const NEXT_WEEK_SESSION = { date: '2026-09-22', type: 'Endurance', durationMinutes: 40, zone: 'Z2', note: null };

  beforeEach(() => {
    getOwnedConversation.mockResolvedValue({ id: 'c1', kind: 'coach_chat', weeklySessionNumber: null });
    getDiscussedWeek.mockResolvedValue('2026-09-21');
    getPendingProposal.mockResolvedValue({ conversationId: 'c1', sessions: [NEXT_WEEK_SESSION] });
  });

  it('validates against the discussed week whole and clears that whole week', async () => {
    const result = await commitWeeklyPlan(ATHLETE, 'c1', WED);

    expect(result).toMatchObject({ ok: true, start: '2026-09-21', end: '2026-09-27', sessionCount: 1 });
    expect(getDiscussedWeek).toHaveBeenCalledWith(ATHLETE.id, 'c1');
    expect(replaceCoachPlanForDateRange).toHaveBeenCalledWith(ATHLETE.id, '2026-09-21', '2026-09-27', expect.any(Array));
  });

  it('does not end a Coach Chat — it is the resting conversation', async () => {
    await commitWeeklyPlan(ATHLETE, 'c1', WED);

    expect(endConversation).not.toHaveBeenCalled();
    expect(recordPlanCommitted).toHaveBeenCalledWith(ATHLETE.id, 'c1', expect.any(Array));
  });

  it('a current-week draft confirmed mid-week is written whole, past days included', async () => {
    getDiscussedWeek.mockResolvedValue('2026-09-14');
    getPendingProposal.mockResolvedValue({
      conversationId: 'c1',
      sessions: [
        { ...NEXT_WEEK_SESSION, date: '2026-09-14' },
        { ...NEXT_WEEK_SESSION, date: '2026-09-19' },
      ],
    });

    expect(await commitWeeklyPlan(ATHLETE, 'c1', WED)).toMatchObject({ ok: true, sessionCount: 2, start: '2026-09-14' });
  });

  it('a chat with no discussed week is bounded to this week’s remainder, as before', async () => {
    getDiscussedWeek.mockResolvedValue(null);

    expect(await commitWeeklyPlan(ATHLETE, 'c1', WED)).toEqual({ ok: false, reason: 'stale' });
    expect(replaceCoachPlanForDateRange).not.toHaveBeenCalled();
  });
});

describe('the planning window is derived from the athlete, not assumed', () => {
  it("reads the athlete's Fixed Constraints and Unavailable Dates", async () => {
    // Every remaining day of TODAY's week is off, so the window falls through and
    // a session inside that week is no longer commitable.
    const constrained = {
      ...ATHLETE,
      profile: { fixedConstraints: ['Thursday', 'Friday', 'Saturday', 'Sunday'] },
    } as unknown as typeof ATHLETE;
    getUnavailableDates.mockResolvedValue(['2026-08-12', '2026-08-13']);
    getPendingProposal.mockResolvedValue({
      sessions: [
        { date: '2026-08-14', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
      ],
    });

    expect(await commitWeeklyPlan(constrained, 'conv_1', TODAY)).toEqual({
      ok: false,
      reason: 'stale',
    });
    expect(getUnavailableDates).toHaveBeenCalledWith(ATHLETE.id);
  });

  it('treats an athlete with no profile as having no constraints', async () => {
    getPendingProposal.mockResolvedValue({
      sessions: [
        { date: '2026-08-14', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
      ],
    });

    // ATHLETE.profile is null; the week is plannable, so this commits.
    expect((await commitWeeklyPlan(ATHLETE, 'conv_1', TODAY)).ok).toBe(true);
  });
});
