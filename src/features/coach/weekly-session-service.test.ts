import { describe, it, expect, vi, beforeEach } from 'vitest';
import { capacityStatement } from '@/features/health/capacity';
import { READINESS_SCORE_TOKENS } from '@/test/readiness-tokens';

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
  deleteOwnedConversation,
  getMessages,
  getOwnedConversation,
  capacityFor,
  getTargetRace,
  getRaces,
  getLatestPlanWrittenAt,
  // No Check-in filed by default: the ordinary week, and the one the prompt has
  // to say it has nothing for rather than inventing scores.
  getCheckInForWeek,
  getEquipmentItems,
  getSessionsForWeek,
  recordProposal,
  getPendingProposal,
  recordPlanCommitted,
  endConversation,
  replaceCoachPlanForDateRange,
  getUnavailableDates,
  recordPlanDeclined,
  logCoachFailure,
} = vi.hoisted(() => ({
  callCoach: vi.fn(),
  appendMessages: vi.fn(),
  countWeeklySessions: vi.fn(() => Promise.resolve(0)),
  createConversation: vi.fn(),
  deleteOwnedConversation: vi.fn(() => Promise.resolve()),
  getMessages: vi.fn(),
  getOwnedConversation: vi.fn(),
  // No race booked by default: the ordinary state for most of these fixtures,
  // and the one the prompt has to state plainly rather than omit.
  getTargetRace: vi.fn<() => Promise<{ id?: string; name: string; date: string } | null>>(
    async () => null,
  ),
  // No other races by default, and no plan written for the week: the ordinary
  // fixture, where none of slice 09's lines render.
  getRaces: vi.fn<() => Promise<unknown[]>>(async () => []),
  getLatestPlanWrittenAt: vi.fn<() => Promise<Date | null>>(async () => null),
  // Nothing wrong by default: the ordinary state, and the one where the prompt
  // carries no capacity block at all rather than "nothing is restricted".
  capacityFor: vi.fn<() => Promise<string | null>>(async () => null),
  getCheckInForWeek: vi.fn<
    () => Promise<{
      energy: number;
      body: number;
      sleepQuality: number;
      notableSignal?: string | null;
    } | null>
  >(async () => null),
  getEquipmentItems: vi.fn(() => Promise.resolve([])),
  getSessionsForWeek: vi.fn(() => Promise.resolve([])),
  recordProposal: vi.fn(() => Promise.resolve()),
  getPendingProposal: vi.fn(),
  recordPlanCommitted: vi.fn(() => Promise.resolve()),
  endConversation: vi.fn(() => Promise.resolve()),
  replaceCoachPlanForDateRange: vi.fn(() => Promise.resolve()),
  getUnavailableDates: vi.fn(() => Promise.resolve([] as string[])),
  recordPlanDeclined: vi.fn(() => Promise.resolve()),
  logCoachFailure: vi.fn(),
}));

vi.mock('./coach-client', () => ({ callCoach }));

// One grounding per turn (knowledge-oracle/05), faked at the module seam: the
// tests assert which tools the Coach is offered and where the citations land.
const CITATION = {
  sourceId: 's1', slug: 'seiler-2010', title: 'Training intensity distribution', authors: 'Seiler S',
  year: 2010, url: null, licence: 'CC BY', licenceUrl: 'https://cc', attribution: 'Seiler 2010', ordinals: [3],
};
const { productionGrounding, groundingResolve, groundingCitations } = vi.hoisted(() => {
  const groundingResolve = vi.fn(async () => '[1] passage');
  const groundingCitations = vi.fn((): unknown[] => []);
  const productionGrounding = vi.fn(() => ({
    tool: { name: 'look_up_training_science', description: 'd', input_schema: { type: 'object' } },
    resolve: groundingResolve,
    citations: groundingCitations,
  }));
  return { productionGrounding, groundingResolve, groundingCitations };
});
vi.mock('./grounding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./grounding')>()),
  productionGrounding,
}));
vi.mock('./conversation-repository', () => ({
  appendMessages,
  countWeeklySessions,
  createConversation,
  deleteOwnedConversation,
  endConversation,
  getMessages,
  getOwnedConversation,
}));
vi.mock('./plan-proposal-repository', () => ({
  getLatestPlanWrittenAt,
  getPendingProposal,
  recordPlanCommitted,
  recordPlanDeclined,
  recordProposal,
}));
vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates }));
const { logCoachDrift } = vi.hoisted(() => ({ logCoachDrift: vi.fn() }));
vi.mock('@/lib/coach-log', () => ({ logCoachFailure, logCoachDrift }));
vi.mock('@/features/health/health-repository', () => ({ capacityFor }));
vi.mock('./check-in-repository', () => ({ getCheckInForWeek }));
vi.mock('@/features/race/race-repository', () => ({ getTargetRace, getRaces }));
vi.mock('./training-block-repository', () => ({ getBlockSet: vi.fn(async () => null) }));
vi.mock('@/features/equipment/equipment-repository', () => ({ getEquipmentItems }));
vi.mock('@/features/session/session-repository', () => ({
  getSessionsForWeek,
  replaceCoachPlanForDateRange,
}));

const { startWeeklySession, continueWeeklySession, commitWeeklyPlan, declineWeeklyPlan } =
  await import('./weekly-session-service');

const ATHLETE = {
  id: 'athlete_1',
  syntheticLabel: null,
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
  deleteOwnedConversation.mockClear();
  getMessages.mockReset().mockResolvedValue([]);
  getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', weeklySessionNumber: 2 });
  recordProposal.mockClear();
  getPendingProposal.mockReset();
  recordPlanCommitted.mockClear();
  endConversation.mockClear();
  replaceCoachPlanForDateRange.mockClear();
  getUnavailableDates.mockReset().mockResolvedValue([]);
  recordPlanDeclined.mockClear();
  logCoachFailure.mockClear();
});

describe('startWeeklySession', () => {
  it('opens the session and stores the Coach’s first turn', async () => {
    const result = await startWeeklySession(ATHLETE, TODAY);

    expect(result).toMatchObject({ ok: true, conversationId: 'conv_new' });
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_new', [
      { role: 'coach_ai', content: 'How did the week feel?', citations: [] },
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

  it('removes the row when the first message cannot be stored', async () => {
    // `?? []` used to launder this into ok-with-no-messages, and merely
    // returning `failed` is not enough either: `countWeeklySessions` counts the
    // row by kind, not by message count, so an unusable session would still
    // advance the Presence Arc a week.
    appendMessages.mockResolvedValue(null);

    const result = await startWeeklySession(ATHLETE, TODAY);

    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(deleteOwnedConversation).toHaveBeenCalledWith('athlete_1', 'conv_new');
  });
});

describe('continueWeeklySession', () => {
  it('stores the athlete turn and the reply together, in order', async () => {
    await continueWeeklySession(ATHLETE, 'conv_1', 'felt strong', TODAY);

    expect(appendMessages).toHaveBeenCalledTimes(1);
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_1', [
      { role: 'athlete', content: 'felt strong' },
      { role: 'coach_ai', content: 'How did the week feel?', citations: [] },
    ]);
  });

  describe('the Coach can look things up mid-session (knowledge-oracle/05)', () => {
    beforeEach(() => {
      productionGrounding.mockClear();
      groundingResolve.mockClear();
      groundingCitations.mockReset().mockReturnValue([]);
    });

    it('offers both tools — the plan proposal and the lookup — with one resolver', async () => {
      await continueWeeklySession(ATHLETE, 'conv_1', 'why is Thursday easy?', TODAY);

      const params = callCoach.mock.calls[0][0];
      expect(params.tools.map((t: { name: string }) => t.name)).toEqual([
        'propose_week_plan',
        'look_up_training_science',
      ]);
      expect(typeof params.resolveTool).toBe('function');
      expect(productionGrounding).toHaveBeenCalledWith(
        expect.objectContaining({ athleteId: 'athlete_1', surface: 'weekly_session', conversationId: 'conv_1' }),
      );
    });

    it('routes a lookup call to the grounding and a plan call to the fixed acknowledgement', async () => {
      await continueWeeklySession(ATHLETE, 'conv_1', 'why?', TODAY);
      const { resolveTool } = callCoach.mock.calls[0][0];

      expect(await resolveTool({ name: 'look_up_training_science', input: { question: 'why?' } })).toBe('[1] passage');
      expect(groundingResolve).toHaveBeenCalledTimes(1);
      // The Weekly Session keeps its own acknowledgement — the Coach must not
      // tell the athlete the week is saved, because it is not, yet.
      expect(await resolveTool({ name: 'propose_week_plan', input: {} })).toContain(
        'Do not say it has been saved',
      );
      expect(await resolveTool({ name: 'something_else', input: {} })).toContain(
        'Do not say it has been saved',
      );
      expect(groundingResolve).toHaveBeenCalledTimes(1);
    });

    it('stores the citations the lookup earned on the Coach reply', async () => {
      groundingCitations.mockReturnValue([CITATION]);
      await continueWeeklySession(ATHLETE, 'conv_1', 'why?', TODAY);
      expect(appendMessages.mock.calls[0][2][1]).toEqual({
        role: 'coach_ai',
        content: 'How did the week feel?',
        citations: [CITATION],
      });
    });

    it('offers the lookup tool on the opening turn as well', async () => {
      await startWeeklySession(ATHLETE, TODAY);
      const params = callCoach.mock.calls[0][0];
      expect(params.tools.map((t: { name: string }) => t.name)).toEqual(['look_up_training_science']);
      expect(appendMessages.mock.calls[0][2]).toEqual([
        { role: 'coach_ai', content: 'How did the week feel?', citations: [] },
      ]);
    });
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
    // `callCoach` lets a tool call through with no prose because the adapter
    // cannot know whether a card will follow. Here we do: the plan fails
    // validation, so there is no card and no text — the reported blank bubble.
    callCoach.mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'propose_week_plan', input: { garbage: true } }],
    });

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(appendMessages).not.toHaveBeenCalled();
    expect(recordProposal).not.toHaveBeenCalled();
  });

  it('refuses a wordless turn even when its proposal is valid', async () => {
    // Storing the athlete's message alone would leave two consecutive athlete
    // turns in the transcript — the API expects alternation, and the Coach would
    // lose the context that it proposed at all. A plan arriving with no
    // explanation is also a poor proposal: ADR 0003 has the athlete decide, and
    // they cannot decide well from a bare card. Nothing is written, nothing is
    // staged; the athlete resends and normally gets prose.
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

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(appendMessages).not.toHaveBeenCalled();
    expect(recordProposal).not.toHaveBeenCalled();
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

// code-health/07 — the service is where the invented readiness was injected, so
// this is the seam that proves it is gone from the string that actually reaches
// Anthropic. The renderer tests prove the prompt *can* omit it; this proves the
// service *does*.
/** `unavailableBlock`'s own tail, which nothing else in the prompt says. */
const UNAVAILABLE_BLOCK = 'no sessions, don';

describe("the Coach is told the athlete's Unavailable Dates", () => {
  /**
   * `renderSystem` passed a literal `[]` for `unavailableDates`, and
   * `unavailableBlock` renders its line only for a non-empty list — so the
   * `UNAVAILABLE:` line had never once rendered in a Weekly Session, and the
   * Coach planned training onto days the athlete had explicitly marked off.
   *
   * The source has existed since slice 14 and the Head Coach's Roster already
   * reads it. Only the athlete's own Coach did not.
   */
  it('names the days the athlete marked off', async () => {
    getUnavailableDates.mockResolvedValue(['2026-08-12', '2026-08-13']);

    await startWeeklySession(ATHLETE, TODAY);

    const { system } = callCoach.mock.calls[0][0];
    // The block's own wording, not the bare token: the base prompt already
    // carries a literal `[UNAVAILABLE:YYYY-MM-DD]` in its constraint-signals
    // instructions, so asserting on "UNAVAILABLE:" alone would pass whether or
    // not the block rendered.
    expect(system).toContain(UNAVAILABLE_BLOCK);
    expect(system).toContain('2026-08-12');
    expect(system).toContain('2026-08-13');
  });

  it('renders no block for an athlete with none', async () => {
    getUnavailableDates.mockResolvedValue([]);

    await startWeeklySession(ATHLETE, TODAY);

    expect(callCoach.mock.calls[0][0].system).not.toContain(UNAVAILABLE_BLOCK);
  });

  it("names the Target Race's date, read from the race repository", async () => {
    // The horizon the whole plan is built backwards from. It comes from the
    // Race row rather than an athlete column, so a date the repository returns
    // and nothing else could have produced is what proves the wiring.
    getTargetRace.mockResolvedValue({ name: 'Ironman Kalmar', date: '2029-08-18' });

    await startWeeklySession(ATHLETE, TODAY);

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('race=Ironman Kalmar on 2029-08-18');
  });

  it('names a Tune-up Race and a race entered after the week was planned (slice 09)', async () => {
    // The rows the repository returns are what prove the wiring: a tune-up the
    // prompt could not have named without `getRaces`, and a "late" flag it could
    // not have derived without `getLatestPlanWrittenAt`.
    const target = {
      id: 't', athleteId: 'a', name: 'Ironman Kalmar', date: '2027-08-18', distance: 'Full',
      isTarget: true, createdAt: new Date('2026-06-01T10:00:00Z'),
    };
    const tuneUp = {
      ...target, id: 'r2', name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic',
      isTarget: false, createdAt: new Date('2026-06-02T10:00:00Z'),
    };
    const late = {
      ...target, id: 'r3', name: 'Half Aarhus', date: '2026-08-30', distance: 'Half',
      isTarget: false, createdAt: new Date('2026-08-11T12:00:00Z'),
    };
    getTargetRace.mockResolvedValue(target);
    getRaces.mockResolvedValue([target, tuneUp, late]);
    getLatestPlanWrittenAt.mockResolvedValue(new Date('2026-08-10T08:00:00Z'));

    await startWeeklySession(ATHLETE, TODAY);

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('TUNE-UPS: Half Aarhus on 2026-08-30 (Half); Olympic Odense on 2027-03-01 (Olympic)');
    expect(system).toContain('LATE RACE: Half Aarhus on 2026-08-30 (Half)');
    expect(system).not.toContain('LATE RACE: Olympic');
    expect(getLatestPlanWrittenAt).toHaveBeenCalledWith(ATHLETE.id, '2026-08-10');
  });

  it('carries the tune-up window only while today is inside it', async () => {
    // Entered 2026-06-01 for 2027-08-18: 443 days, so the window is day 133–266
    // (2026-10-12 – 2027-02-22). TODAY is 2026-08-12, before it opens.
    const target = {
      id: 't', athleteId: 'a', name: 'Ironman Kalmar', date: '2027-08-18', distance: 'Full',
      isTarget: true, createdAt: new Date('2026-06-01T10:00:00Z'),
    };
    getTargetRace.mockResolvedValue(target);
    getRaces.mockResolvedValue([target]);

    await startWeeklySession(ATHLETE, TODAY);
    expect(callCoach.mock.calls[0][0].system).not.toContain('TUNE-UP WINDOW');

    callCoach.mockClear();
    await startWeeklySession(ATHLETE, '2026-12-01');
    expect(callCoach.mock.calls[0][0].system).toContain('TUNE-UP WINDOW: now (2026-10-12–2027-02-22)');
  });

  it('tells the Coach plainly when the athlete has no Target Race', async () => {
    // Omission is the failure mode: a prompt with no race line reads as one
    // whose race line was forgotten, and the Coach invents a horizon.
    getTargetRace.mockResolvedValue(null);

    await startWeeklySession(ATHLETE, TODAY);

    expect(callCoach.mock.calls[0][0].system).toContain('no race booked');
  });

  it('names the dates the repository returned, not a re-derivation', async () => {
    getUnavailableDates.mockResolvedValue(['2026-11-30']);

    await startWeeklySession(ATHLETE, TODAY);

    // A date far outside TODAY's week: anything computing its own list from the
    // week would never produce this, and would pass the first test regardless.
    expect(callCoach.mock.calls[0][0].system).toContain('2026-11-30');
  });

  it('reads them once per turn, not once per consumer', async () => {
    // `renderSystem` needs them for the prompt and `planningWindowFor` needs them for
    // the planning window, and both run inside `startWeeklySession`. Fetching
    // in each is two round trips for one answer (showable-version/15).
    getUnavailableDates.mockResolvedValue(['2026-08-12']);

    await startWeeklySession(ATHLETE, TODAY);

    expect(getUnavailableDates).toHaveBeenCalledTimes(1);
  });
});

describe('the system prompt carries no invented readiness', () => {

  it('sends no readiness scores when the athlete has never given a Check-in', async () => {
    await startWeeklySession(ATHLETE, TODAY);

    const { system } = callCoach.mock.calls[0][0];
    for (const token of READINESS_SCORE_TOKENS) expect(system).not.toMatch(token);
    expect(system).toContain('NO CHECK-IN DATA');
  });

  it('still sends the facts that are real', async () => {
    await startWeeklySession(ATHLETE, TODAY);

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('xp=intermediate');
  });

  it('sends a phase derived from the horizon, and none without one', async () => {
    // The Training Phase is no longer a column written once at onboarding and
    // never recomputed — it is the block today falls inside. An athlete with no
    // Target Race has no blocks, and the prompt omits the phase rather than
    // naming one nobody derived.
    await startWeeklySession(ATHLETE, TODAY);
    expect(callCoach.mock.calls[0][0].system).not.toContain('phase=');

    getTargetRace.mockResolvedValue({ name: 'Ironman Kalmar', date: '2027-08-18' });
    callCoach.mockClear();
    await startWeeklySession(ATHLETE, TODAY);
    expect(callCoach.mock.calls[0][0].system).toContain('phase=Block 1 of 6');
  });

  it('names the Coach-shaped block when a stored set fits the race (training-architecture/07)', async () => {
    getTargetRace.mockResolvedValue({ id: 'race-1', name: 'Ironman Kalmar', date: '2027-08-18' });
    const { getBlockSet } = await import('./training-block-repository');
    vi.mocked(getBlockSet).mockResolvedValueOnce({
      id: 'set-1',
      athleteId: ATHLETE.id,
      raceId: 'race-1',
      startDate: TODAY,
      version: 1,
      blocks: [
        { name: 'Build the Volume', endDate: '2027-02-01', authoredBy: 'coach_ai' },
        { name: 'Taper', endDate: '2027-08-18', authoredBy: 'coach_ai' },
      ],
    });

    await startWeeklySession(ATHLETE, TODAY);

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('phase=Build the Volume');
    expect(system).not.toContain('Block 1 of');
  });
});

/**
 * The planning window at the commit gate (`showable-version/11`).
 *
 * `commitWeeklyPlan` re-validates the staged proposal before writing, and since
 * 2026-09-03 it re-validates against the *window* rather than against `today`
 * alone. That matters because the window is derived fresh: a proposal staged
 * legally and confirmed later, or one whose athlete has since marked the rest of
 * the week unavailable, is no longer a week the server will write.
 */
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
 * The two decision endpoints of a Weekly Session: the athlete confirms the week,
 * or they do not. Both are ownership-scoped (ADR 0006) and both are reachable
 * from a client, so what they refuse matters as much as what they do.
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

  it('ends the conversation once the week is written', async () => {
    getPendingProposal.mockResolvedValue({
      sessions: [
        { date: '2026-08-14', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
      ],
    });

    const result = await commitWeeklyPlan(ATHLETE, 'conv_1', TODAY);

    expect(result.ok).toBe(true);
    expect(recordPlanCommitted).toHaveBeenCalled();
    // The ritual is over once the week is agreed — the thread does not stay open.
    expect(endConversation).toHaveBeenCalled();
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

/**
 * What the service actually hands the Coach, and what it does when the Coach
 * fails. These are the arguments that decide whether a Weekly Session is a
 * Weekly Session at all — the opener, the token budget, the proposal tool — and
 * none of them were asserted before 2026-09-03.
 */
describe('what the service sends the Coach', () => {
  it('opens session N+1 with the fixed opener and the weekly token budget', async () => {
    countWeeklySessions.mockResolvedValue(3);
    getMessages.mockResolvedValue([{ id: 'm1', role: 'coach_ai', content: 'Hi', seq: 0 }]);

    await startWeeklySession(ATHLETE, TODAY);

    expect(callCoach).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: "Let's do our weekly session." }],
        maxTokens: 1400,
      }),
    );
    // The fourth session, not the third: the count is of sessions already held.
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'weekly_session', weeklySessionNumber: 4 }),
    );
  });

  it('offers the proposal tool on a continuing turn, with the acknowledgement', async () => {
    getMessages.mockResolvedValue([{ id: 'm1', role: 'coach_ai', content: 'Hi', seq: 0 }]);
    appendMessages.mockResolvedValue([]);

    await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    const args = callCoach.mock.calls.at(-1)?.[0];
    expect(args.maxTokens).toBe(1400);
    expect(args.tools?.[0]?.name).toBe('propose_week_plan');
    // The Coach must not tell the athlete the week is saved — it is not, yet.
    // Since knowledge-oracle/05 the acknowledgement comes through the per-call
    // resolver (one round-trip may carry a lookup *and* a proposal).
    expect(await args.resolveTool({ name: 'propose_week_plan', input: {} })).toContain(
      'Do not say it has been saved',
    );
    // The athlete's turn reaches the API even though it is not stored yet.
    expect(args.messages.at(-1)).toEqual({ role: 'user', content: 'plan my week' });
  });

  it('mints no conversation when the opening call fails', async () => {
    callCoach.mockRejectedValue(new Error('upstream down'));

    const result = await startWeeklySession(ATHLETE, TODAY);

    expect(result.ok).toBe(false);
    // A Weekly Session that never spoke is not one the athlete has held: minting
    // the row anyway would make `countWeeklySessions` skip a number for good.
    expect(createConversation).not.toHaveBeenCalled();
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it('writes nothing when a continuing turn fails', async () => {
    getMessages.mockResolvedValue([{ id: 'm1', role: 'coach_ai', content: 'Hi', seq: 0 }]);
    callCoach.mockRejectedValue(new Error('upstream down'));

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    expect(result.ok).toBe(false);
    expect(appendMessages).not.toHaveBeenCalled();
    expect(recordProposal).not.toHaveBeenCalled();
  });
});

describe('staging a proposal on a continuing turn', () => {
  const validCall = {
    name: 'propose_week_plan',
    input: {
      sessions: [
        { date: '2026-08-14', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy' },
      ],
    },
  };

  beforeEach(() => {
    getMessages.mockResolvedValue([{ id: 'm1', role: 'coach_ai', content: 'Hi', seq: 0 }]);
    appendMessages.mockResolvedValue([{ id: 'm2', role: 'athlete', content: 'ok', seq: 1 }]);
  });

  it('stages a valid proposal alongside the stored turn', async () => {
    callCoach.mockResolvedValue({ text: "Here's your week.", toolCalls: [validCall] });

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    expect(result).toMatchObject({ ok: true });
    expect(recordProposal).toHaveBeenCalledWith(ATHLETE.id, 'conv_1', [
      { date: '2026-08-14', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy' },
    ]);
  });

  it('stages nothing, but still stores the turn, when the plan falls outside the window', async () => {
    // 2026-08-17 is the Monday after TODAY's week — a week nobody agreed to.
    callCoach.mockResolvedValue({
      text: "Here's your week.",
      toolCalls: [
        {
          name: 'propose_week_plan',
          input: {
            sessions: [
              { date: '2026-08-17', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
            ],
          },
        },
      ],
    });

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    // The Coach's words still reach the athlete; only the plan is refused.
    expect(result).toMatchObject({ ok: true, proposal: null });
    expect(appendMessages).toHaveBeenCalled();
    expect(recordProposal).not.toHaveBeenCalled();
  });

  it('stages nothing when the Coach called no tool at all', async () => {
    callCoach.mockResolvedValue({ text: 'How did the week feel?', toolCalls: [] });

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'ok', TODAY);

    expect(result).toMatchObject({ ok: true, proposal: null });
    expect(recordProposal).not.toHaveBeenCalled();
  });

  it('refuses when the turn could not be stored, and stages nothing', async () => {
    appendMessages.mockResolvedValue(null);
    callCoach.mockResolvedValue({ text: "Here's your week.", toolCalls: [validCall] });

    expect(await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY)).toEqual({
      ok: false,
      reason: 'not-owner',
    });
    expect(recordProposal).not.toHaveBeenCalled();
  });
});

describe('the last details the Coach path depends on', () => {
  beforeEach(() => {
    getMessages.mockResolvedValue([{ id: 'm1', role: 'coach_ai', content: 'Hi', seq: 0 }]);
    appendMessages.mockResolvedValue([{ id: 'm2', role: 'athlete', content: 'ok', seq: 1 }]);
  });

  it('tells the Coach exactly what a staged proposal means', async () => {
    await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    const { resolveTool } = callCoach.mock.calls.at(-1)?.[0];
    expect(await resolveTool({ name: 'propose_week_plan', input: {} })).toBe(
      'The plan has been shown to the athlete to confirm or cancel. Acknowledge briefly and ' +
        'invite them to confirm when ready. Do not say it has been saved.',
    );
  });

  it('logs a failed opening turn against the weekly surface with no conversation', async () => {
    callCoach.mockRejectedValue(new Error('upstream down'));

    await startWeeklySession(ATHLETE, TODAY);

    expect(logCoachFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'weekly_session',
        athleteId: ATHLETE.id,
        // No row exists yet — it is minted only after the Coach has spoken.
        conversationId: null,
      }),
    );
  });

  it('logs a failed continuing turn against the conversation it belongs to', async () => {
    callCoach.mockRejectedValue(new Error('upstream down'));

    await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    expect(logCoachFailure).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'weekly_session', conversationId: 'conv_1' }),
    );
  });

  it('treats a conversation with no session number as the first', async () => {
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', weeklySessionNumber: null });

    await continueWeeklySession(ATHLETE, 'conv_1', 'hello', TODAY);

    // Session 1 renders the welcome arc, which no later session does.
    expect(callCoach.mock.calls.at(-1)?.[0].system).toContain('ARC — SESSION 1');
  });

  it('ignores a tool call that is not the plan proposal', async () => {
    // The payload is deliberately a VALID week: if the name check were dropped,
    // this would stage a plan the Coach never proposed. An empty payload would
    // be refused by validation anyway and would prove nothing.
    callCoach.mockResolvedValue({
      text: 'Sure.',
      toolCalls: [
        {
          name: 'some_other_tool',
          input: {
            sessions: [
              { date: '2026-08-14', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
            ],
          },
        },
      ],
    });

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'hi', TODAY);

    expect(result).toMatchObject({ ok: true, proposal: null });
    expect(recordProposal).not.toHaveBeenCalled();
  });

  it('returns the staged sessions to the caller, not just records them', async () => {
    callCoach.mockResolvedValue({
      text: "Here's your week.",
      toolCalls: [
        {
          name: 'propose_week_plan',
          input: {
            sessions: [
              { date: '2026-08-14', type: 'Tempo', durationMinutes: 45, zone: 'Z3', note: null },
            ],
          },
        },
      ],
    });

    const result = await continueWeeklySession(ATHLETE, 'conv_1', 'plan my week', TODAY);

    expect(result).toMatchObject({
      ok: true,
      proposal: {
        sessions: [
          { date: '2026-08-14', type: 'Tempo', durationMinutes: 45, zone: 'Z3', note: null },
        ],
      },
    });
  });

  it('tells the Coach about no Unavailable Dates it was not given', async () => {
    // The service passes a literal [] for unavailableDates today — see
    // showable-version/15, which is the ticket to wire the real ones through.
    // When that lands this assertion is the one that should change.
    await continueWeeklySession(ATHLETE, 'conv_1', 'hi', TODAY);

    // Not the bare word: CONSTRAINT_SIGNALS carries an `[UNAVAILABLE:YYYY-MM-DD]`
    // token of its own, which is the syntax the Coach emits, not a date list.
    expect(callCoach.mock.calls.at(-1)?.[0].system).not.toContain(
      "no sessions, don't mention unless athlete raises it",
    );
  });
});

describe('the Check-in reaches the Coach, and its absence is stated', () => {
  it("sends the athlete's own scores when they checked in this week", async () => {
    getCheckInForWeek.mockResolvedValue({ energy: 4, body: 6, sleepQuality: 3 });

    await startWeeklySession(ATHLETE, TODAY);

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('body=6/10 energy=4/10 sleep-quality=3/10');
    expect(system).not.toContain('NO CHECK-IN DATA');
    // Still no wearable feed, and the Coach is told so rather than left to
    // assume the check-in is everything it can see.
    expect(system).toContain('NO DEVICE DATA');
  });

  it('says plainly that the athlete did not check in, and plans anyway', async () => {
    // ADR 0007: the Weekly Session is not a gate. Skipping the Check-in must
    // still produce a week.
    getCheckInForWeek.mockResolvedValue(null);

    const result = await startWeeklySession(ATHLETE, TODAY);

    expect(result.ok).toBe(true);
    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('NO CHECK-IN DATA');
    for (const token of READINESS_SCORE_TOKENS) expect(system).not.toMatch(token);
  });

  it('reads the Check-in for the Monday of today, not for today', async () => {
    // Once per week, not daily (CONTEXT.md). A Thursday session reads Monday's
    // report; asking for Thursday's would find nothing every time.
    getCheckInForWeek.mockResolvedValue(null);

    await startWeeklySession(ATHLETE, '2026-08-13'); // a Thursday

    expect(getCheckInForWeek).toHaveBeenCalledWith('athlete_1', '2026-08-10');
  });
});


describe('what the athlete\'s body allows reaches the Coach', () => {
  it('states the capacity, and that it is not a diagnosis', async () => {
    capacityFor.mockResolvedValue(
      capacityStatement([{ capacity: { swim: 'full', bike: 'easy', run: 'none' } }], false),
    );

    await startWeeklySession(ATHLETE, TODAY);

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('no run');
    expect(system).toContain('bike easy only');
    expect(system).toContain('not a diagnosis');
    expect(system).toContain('substitute rather than cancel');
  });

  it('lets an illness remove everything, whatever an injury said', async () => {
    capacityFor.mockResolvedValue(
      capacityStatement([{ capacity: { swim: 'full', bike: 'easy', run: 'none' } }], true),
    );

    await startWeeklySession(ATHLETE, TODAY);

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('no swim');
    expect(system).toContain('no bike');
    expect(system).toContain('no run');
  });

  it('says nothing at all about a body with nothing wrong', async () => {
    // Not "nothing is restricted". A block on every prompt for every healthy
    // athlete is noise the model learns to skip, and this one has to be read on
    // the week it appears.
    capacityFor.mockResolvedValue(null);

    await startWeeklySession(ATHLETE, TODAY);

    expect(callCoach.mock.calls[0][0].system).not.toContain('CAPACITY:');
  });
});


describe("the athlete's own sentence survives the whole path", () => {
  it('reaches the prompt from the stored Check-in row', async () => {
    // The gap the review found: the form wrote it, the repository stored it,
    // and nothing read it. This is the end-to-end pin.
    getCheckInForWeek.mockResolvedValue({
      energy: 4,
      body: 6,
      sleepQuality: 3,
      notableSignal: 'calf tight since Tuesday',
    });

    await startWeeklySession(ATHLETE, TODAY);

    expect(callCoach.mock.calls[0][0].system).toContain('"calf tight since Tuesday"');
  });

  it('is absent when the athlete left it blank', async () => {
    getCheckInForWeek.mockResolvedValue({
      energy: 4,
      body: 6,
      sleepQuality: 3,
      notableSignal: null,
    });

    await startWeeklySession(ATHLETE, TODAY);

    expect(callCoach.mock.calls[0][0].system).not.toContain('ATHLETE SAID');
  });
});

describe('the grounding knows whose turn it is (knowledge-oracle/05, /06)', () => {
  beforeEach(() => {
    productionGrounding.mockClear();
    logCoachDrift.mockClear();
    getTargetRace.mockResolvedValue(null);
  });

  it('is built for the athlete, the Weekly Session surface, and the phase the prompt names', async () => {
    getTargetRace.mockResolvedValue({ name: 'Ironman Kalmar', date: '2029-08-18' });

    await startWeeklySession(ATHLETE, TODAY);

    expect(productionGrounding).toHaveBeenCalledTimes(1);
    expect(productionGrounding).toHaveBeenCalledWith({
      athleteId: 'athlete_1',
      surface: 'weekly_session',
      // A first turn has no conversation yet; the id is minted after the reply.
      conversationId: null,
      phase: expect.stringMatching(/^Block \d+ of \d+$/),
      experienceLevel: 'intermediate',
    });
  });

  it('passes null, not undefined, when there is no race and no stated experience', async () => {
    const unknown = { ...(ATHLETE as object), experienceLevel: null } as typeof ATHLETE;

    await startWeeklySession(unknown, TODAY);

    expect(productionGrounding).toHaveBeenCalledWith(
      expect.objectContaining({ phase: null, experienceLevel: null }),
    );
  });

  it('logs a first reply that cites its sources, against the surface and no conversation', async () => {
    callCoach.mockResolvedValue({ text: 'Polarised works [1], according to the study.', toolCalls: [] });

    await startWeeklySession(ATHLETE, TODAY);

    expect(logCoachDrift).toHaveBeenCalledWith({
      surface: 'weekly_session',
      athleteId: 'athlete_1',
      conversationId: null,
      patterns: ['bracket-marker', 'according-to-study'],
    });
  });

  it('logs a continuing reply that cites its sources, against the conversation it happened in', async () => {
    callCoach.mockResolvedValue({ text: 'Polarised works [1].', toolCalls: [] });

    await continueWeeklySession(ATHLETE, 'conv_1', 'why?', TODAY);

    expect(logCoachDrift).toHaveBeenCalledWith({
      surface: 'weekly_session',
      athleteId: 'athlete_1',
      conversationId: 'conv_1',
      patterns: ['bracket-marker'],
    });
  });

  it('logs nothing about drift for an ordinary reply', async () => {
    await startWeeklySession(ATHLETE, TODAY);
    await continueWeeklySession(ATHLETE, 'conv_1', 'felt strong', TODAY);
    expect(logCoachDrift).not.toHaveBeenCalled();
  });
});
