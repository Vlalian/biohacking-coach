import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The Weekly Session orchestration — the half that talks to Postgres and the
 * Anthropic API. Its pure half is covered by `weekly-session.test.ts`; this file
 * exists because the service had no test at all, and the bug below lived in
 * exactly that gap.
 *
 * Reported by Mads on 2026-08-16 from the running app: he asked the Coach to
 * start the Weekly Session and got a blank Coach message, which persisted. The
 * empty turn was then replayed as history on every later request. The adapter
 * now refuses an empty turn; these tests hold the services to writing *nothing*
 * when that happens.
 */

const {
  callCoach,
  appendMessages,
  countWeeklySessions,
  createConversation,
  getMessages,
  getOwnedConversation,
  getEquipmentItems,
  getSessionsForWeek,
  recordProposal,
} = vi.hoisted(() => ({
  callCoach: vi.fn(),
  appendMessages: vi.fn(),
  countWeeklySessions: vi.fn(() => Promise.resolve(0)),
  createConversation: vi.fn(),
  getMessages: vi.fn(),
  getOwnedConversation: vi.fn(),
  getEquipmentItems: vi.fn(() => Promise.resolve([])),
  getSessionsForWeek: vi.fn(() => Promise.resolve([])),
  recordProposal: vi.fn(() => Promise.resolve()),
}));

vi.mock('./coach-client', () => ({ callCoach }));
vi.mock('./conversation-repository', () => ({
  appendMessages,
  countWeeklySessions,
  createConversation,
  endConversation: vi.fn(),
  getMessages,
  getOwnedConversation,
}));
vi.mock('./plan-proposal-repository', () => ({
  getPendingProposal: vi.fn(),
  recordPlanCommitted: vi.fn(),
  recordPlanDeclined: vi.fn(),
  recordProposal,
}));
vi.mock('@/features/equipment/equipment-repository', () => ({ getEquipmentItems }));
vi.mock('@/features/session/session-repository', () => ({
  getSessionsForWeek,
  replaceCoachPlanForDateRange: vi.fn(),
}));

const { startWeeklySession, continueWeeklySession } = await import('./weekly-session-service');

const ATHLETE = {
  id: 'athlete_1',
  syntheticLabel: null,
  trainingPhase: 'Base Building',
  experienceLevel: 'intermediate',
  communicationStyle: null,
  raceTarget: 'Ironman Copenhagen',
  trainingSessionsPerWeek: null,
  profile: null,
} as unknown as Parameters<typeof startWeeklySession>[0];

const TODAY = '2026-08-12';

beforeEach(() => {
  callCoach.mockReset().mockResolvedValue({
    text: 'How did the week feel?',
    toolCalls: [],
  });
  appendMessages.mockReset().mockResolvedValue([]);
  countWeeklySessions.mockClear();
  createConversation.mockReset().mockResolvedValue({ id: 'conv_new' });
  getMessages.mockReset().mockResolvedValue([]);
  getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', weeklySessionNumber: 2 });
  recordProposal.mockClear();
});

describe('startWeeklySession', () => {
  it('opens the session and stores the Coach’s first turn', async () => {
    const result = await startWeeklySession(ATHLETE, TODAY);

    expect(result).toMatchObject({ ok: true, conversationId: 'conv_new' });
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_new', [
      { role: 'coach_ai', content: 'How did the week feel?' },
    ]);
  });

  it('creates no conversation when the opening turn fails', async () => {
    // `countWeeklySessions` decides the Presence Arc stage, so an empty Weekly
    // Session left behind by a failed start would silently advance the
    // relationship a week — the Coach would open session 3 having held two.
    callCoach.mockRejectedValue(new Error('empty turn'));

    const result = await startWeeklySession(ATHLETE, TODAY);

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(createConversation).not.toHaveBeenCalled();
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it('reports a failed append instead of returning an empty session', async () => {
    // `?? []` used to launder this into ok-with-no-messages. The row is counted
    // by `countWeeklySessions` either way, so the Presence Arc would advance a
    // week on a session holding nothing.
    appendMessages.mockResolvedValue(null);

    const result = await startWeeklySession(ATHLETE, TODAY);

    expect(result).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('continueWeeklySession', () => {
  it('stores the athlete turn and the reply together, in order', async () => {
    await continueWeeklySession(ATHLETE, 'conv_1', 'felt strong', TODAY);

    expect(appendMessages).toHaveBeenCalledTimes(1);
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_1', [
      { role: 'athlete', content: 'felt strong' },
      { role: 'coach_ai', content: 'How did the week feel?' },
    ]);
  });

  it('writes nothing when the Coach turn fails — no question without an answer', async () => {
    // The reported bug, at the service seam: the athlete's message used to be
    // persisted before the API call, so a failure left it stranded and a retry
    // would post it twice.
    callCoach.mockRejectedValue(new Error('empty turn'));

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'felt strong', TODAY);

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it('refuses a wordless turn whose proposal failed validation', async () => {
    // The remaining path to the reported symptom: `callCoach` lets a tool call
    // through with no prose because the confirm card carries the meaning — but
    // if the plan then fails validation there is no card either, and storing the
    // turn would put a blank bubble in the thread exactly as reported.
    callCoach.mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'propose_week_plan', input: { garbage: true } }],
    });

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(appendMessages).not.toHaveBeenCalled();
    expect(recordProposal).not.toHaveBeenCalled();
  });

  it('stores no empty Coach bubble when a valid proposal carries the turn', async () => {
    // The other half: a wordless turn that DID stage a plan is meaningful, so it
    // is kept — but only the athlete's message is written. The card speaks for
    // the Coach; an empty bubble beside it is the same defect, better dressed.
    callCoach.mockResolvedValue({
      text: '',
      toolCalls: [
        {
          name: 'propose_week_plan',
          input: {
            sessions: [
              { date: '2026-08-17', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy' },
            ],
          },
        },
      ],
    });

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    expect(result).toMatchObject({ ok: true });
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_1', [
      { role: 'athlete', content: 'plan my week' },
    ]);
    expect(recordProposal).toHaveBeenCalled();
  });

  it("sends the athlete's turn to the Coach even though it is not stored yet", async () => {
    getMessages.mockResolvedValue([
      { id: 'm1', role: 'coach_ai', content: 'How did it go?', seq: 0 },
    ]);

    await continueWeeklySession(ATHLETE, 'conv_1', 'felt strong', TODAY);

    const sent = callCoach.mock.calls[0][0].messages;
    expect(sent[sent.length - 1]).toEqual({ role: 'user', content: 'felt strong' });
  });

  it('refuses an empty message without calling the Coach', async () => {
    const result = await continueWeeklySession(ATHLETE, 'conv_1', '   ', TODAY);

    expect(result).toEqual({ ok: false, reason: 'empty' });
    expect(callCoach).not.toHaveBeenCalled();
  });

  it("refuses another athlete's conversation without calling the Coach", async () => {
    getOwnedConversation.mockResolvedValue(null);

    const result = await continueWeeklySession(ATHLETE, 'conv_theirs', 'hi', TODAY);

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(callCoach).not.toHaveBeenCalled();
    expect(appendMessages).not.toHaveBeenCalled();
  });
});
