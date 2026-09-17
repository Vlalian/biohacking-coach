import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '@/features/session/session';
import type { Message } from './conversation';
import { READINESS_SCORE_TOKENS } from '@/test/readiness-tokens';
import { currentPhase, trainingBlocks } from './training-blocks';

const {
  callCoach,
  createConversation,
  getOwnedConversation,
  appendMessages,
  getMessages,
  getEquipmentItems,
  getOwnedSession,
  getSessionsForWeek,
  logCoachFailure,
} = vi.hoisted(() => ({
  callCoach: vi.fn(),
  createConversation: vi.fn(),
  getOwnedConversation: vi.fn(),
  appendMessages: vi.fn(),
  getMessages: vi.fn(),
  getEquipmentItems: vi.fn(() => Promise.resolve([])),
  getOwnedSession: vi.fn(),
  getSessionsForWeek: vi.fn(() => Promise.resolve([] as Session[])),
  logCoachFailure: vi.fn(),
}));

vi.mock('./coach-client', () => ({ callCoach }));
const { logCoachDrift } = vi.hoisted(() => ({ logCoachDrift: vi.fn() }));
vi.mock('@/lib/coach-log', () => ({ logCoachFailure, logCoachDrift }));
const { capacityFor } = vi.hoisted(() => ({ capacityFor: vi.fn<() => Promise<string | null>>(async () => null) }));
vi.mock('@/features/health/health-repository', () => ({ capacityFor }));

// One grounding per turn (knowledge-oracle/05). Faked at the module seam so
// these tests assert the wiring — which tools the Coach is offered, where the
// citations land — without an embedder or a corpus.
const GROUNDING_CITATION = {
  sourceId: 's1', slug: 'seiler-2010', title: 'Training intensity distribution', authors: 'Seiler S',
  year: 2010, url: null, licence: 'CC BY', licenceUrl: 'https://cc', attribution: 'Seiler 2010', ordinals: [3],
};
const { productionGrounding, groundingResolve } = vi.hoisted(() => {
  const groundingResolve = vi.fn(async () => '[1] passage');
  const productionGrounding = vi.fn(() => ({
    tool: { name: 'look_up_training_science', description: 'd', input_schema: { type: 'object' } },
    resolve: groundingResolve,
    citations: () => [] as unknown[],
  }));
  return { productionGrounding, groundingResolve };
});
vi.mock('./grounding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./grounding')>()),
  productionGrounding,
}));
vi.mock('./conversation-repository', () => ({
  createConversation,
  getOwnedConversation,
  appendMessages,
  getMessages,
  getLatestOpenConversation,
}));
vi.mock('./check-in-repository', () => ({
  // No Check-in filed: the ordinary week, and the one the prompt has to say it
  // has nothing for rather than inventing scores.
  getCheckInForWeek: vi.fn(async () => null),
}));
const { getTargetRace, getRaces, getLatestPlanWrittenAt, getLatestOpenConversation } = vi.hoisted(() => ({
  // No race booked: the ordinary state for most of these fixtures, and the one
  // the prompt has to state plainly rather than omit.
  getTargetRace: vi.fn<() => Promise<unknown>>(async () => null),
  getRaces: vi.fn<() => Promise<unknown[]>>(async () => []),
  getLatestPlanWrittenAt: vi.fn<() => Promise<Date | null>>(async () => null),
  getLatestOpenConversation: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock('@/features/race/race-repository', () => ({ getTargetRace, getRaces }));
const { recordProposal, getPendingProposal, getDiscussedWeek, getUnavailableDates } = vi.hoisted(() => ({
  recordProposal: vi.fn(async () => undefined),
  getPendingProposal: vi.fn(async (): Promise<unknown> => null),
  getDiscussedWeek: vi.fn(async (): Promise<string | null> => null),
  getUnavailableDates: vi.fn(async (): Promise<string[]> => []),
}));
vi.mock('./plan-proposal-repository', () => ({ getLatestPlanWrittenAt, recordProposal, getPendingProposal }));
vi.mock('./week-draft-repository', () => ({ getDiscussedWeek }));
vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates }));
vi.mock('./training-block-repository', () => ({ getBlockSet: vi.fn(async () => null) }));
vi.mock('@/features/equipment/equipment-repository', () => ({ getEquipmentItems }));
vi.mock('@/features/session/session-repository', () => ({
  getOwnedSession,
  getSessionsForWeek,
}));

const { sendCoachChatMessage, getOpenCoachChat } = await import('./coach-chat-service');
// Coach Chat's history is the shared conversion with no primer — the athlete
// speaks first here, so there is no fabricated opening turn. Imported from the
// shared module rather than re-exported by the service, so the test asserts the
// behaviour Coach Chat actually gets.
const { toApiMessages } = await import('./conversation');
const { PROPOSAL_ACK } = await import('./proposal-tools');

const ATHLETE = {
  id: 'athlete_1',
  syntheticLabel: null,
  experienceLevel: 'intermediate',
  communicationStyle: null,
  raceTarget: 'Ironman Kona',
  trainingSessionsPerWeek: null,
  profile: null,
} as unknown as Parameters<typeof sendCoachChatMessage>[0];

function msg(role: Message['role'], content: string, seq: number): Message {
  return { id: `m${seq}`, role, content, seq, citations: [], createdAt: new Date('2026-08-12T09:00:00Z') };
}

describe('toApiMessages, as Coach Chat uses it (no primer)', () => {
  it('maps the transcript without inventing an opening turn', () => {
    // The Weekly Session's mapper prepends a fixed user primer because the Coach
    // speaks first there. In Coach Chat the athlete speaks first, so a primer
    // would fabricate a turn they never took — the first message must be theirs.
    const api = toApiMessages([
      msg('athlete', 'what should I eat before a long ride?', 0),
      msg('coach_ai', 'Start fuelling early.', 1),
    ]);

    expect(api).toEqual([
      { role: 'user', content: 'what should I eat before a long ride?' },
      { role: 'assistant', content: 'Start fuelling early.' },
    ]);
  });

  it('maps a head_coach turn to the user role, not assistant', () => {
    // Only the AI is the assistant. A Head Coach turn is another human speaking.
    expect(toApiMessages([msg('head_coach', 'Ease off Thursday.', 0)])).toEqual([
      { role: 'user', content: 'Ease off Thursday.' },
    ]);
  });

  it('returns an empty history for a fresh chat', () => {
    expect(toApiMessages([])).toEqual([]);
  });
});

describe('sendCoachChatMessage', () => {
  beforeEach(() => {
    callCoach.mockReset().mockResolvedValue({ text: 'Fuel early.', toolCalls: [] });
    createConversation.mockReset().mockResolvedValue({ id: 'conv_new' });
    getOwnedConversation.mockReset();
    appendMessages.mockReset().mockResolvedValue([]);
    getMessages.mockReset().mockResolvedValue([]);
    getOwnedSession.mockReset().mockResolvedValue(undefined);
    getEquipmentItems.mockClear();
  });

  it('creates the conversation lazily on the first message', async () => {
    // Opening the overlay must not mint a conversation or call the API; the
    // first actual message is what brings the thread into existence.
    const result = await sendCoachChatMessage(ATHLETE, null, 'hello', '2026-08-12');

    expect(createConversation).toHaveBeenCalledWith({
      athleteId: 'athlete_1',
      kind: 'coach_chat',
    });
    expect(result).toMatchObject({ ok: true, conversationId: 'conv_new' });
  });

  it('reuses an existing conversation rather than starting a second', async () => {
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });

    const result = await sendCoachChatMessage(ATHLETE, 'conv_1', 'again', '2026-08-12');

    expect(createConversation).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, conversationId: 'conv_1' });
  });

  it('refuses a wordless tool-only reply as coach-unavailable and writes nothing', async () => {
    // The adapter allows a wordless tool call because it cannot know whether a
    // card will follow; here we do know, and the answer is the same as the
    // Weekly Session's: a proposal with no explanation is not a turn, and an
    // empty Coach message must not be stored and replayed as history.
    callCoach.mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'propose_week_plan', input: { sessions: [] } }],
    });

    const result = await sendCoachChatMessage(ATHLETE, null, 'plan my week', '2026-08-12');

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(createConversation).not.toHaveBeenCalled();
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it('reports coach-unavailable when the Coach call rejects', async () => {
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    callCoach.mockRejectedValue(new Error('upstream 529'));

    const result = await sendCoachChatMessage(ATHLETE, 'conv_1', 'should I ride?', '2026-08-12');

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
  });

  it('names Coach Chat as the surface in the failure log', async () => {
    // The log exists so a churned tester can be told apart from one who simply
    // stopped caring (`showable-version/05`, item 2), and that only works if the
    // surfaces are distinguishable. The turn machinery is shared with the
    // Feedback Interview now, so which surface is reported is this caller's to
    // get right.
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    callCoach.mockRejectedValue(new Error('upstream 529'));

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'should I ride?', '2026-08-12');

    expect(logCoachFailure).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'coach_chat', conversationId: 'conv_1' }),
    );
  });

  it('writes nothing when the Coach call rejects — no question without an answer', async () => {
    // The failure mode this ordering exists to prevent: the athlete's turn
    // persisted, the reply never arriving, and a retry duplicating the message.
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    callCoach.mockRejectedValue(new Error('upstream 529'));

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'should I ride?', '2026-08-12');

    expect(appendMessages).not.toHaveBeenCalled();
  });

  it('reports unsafe-content when prompt rendering refuses an identifier', async () => {
    // A session note is free text and unvalidated, so an athlete who typed an
    // email into one and then discussed that session hits the prompt builder's
    // assertion. Told apart from coach-unavailable deliberately: "try again"
    // is useless advice for content that will be refused identically.
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    getOwnedSession.mockResolvedValue({
      id: 'sess_1',
      type: 'Endurance',
      date: '2026-08-18',
      duration: 90,
      zone: 'Z2',
      note: 'ride with me — mads@example.com',
      status: 'planned',
    });

    const result = await sendCoachChatMessage(
      ATHLETE,
      'conv_1',
      'about this one?',
      '2026-08-12',
      undefined,
      'sess_1',
    );

    expect(result).toEqual({ ok: false, reason: 'unsafe-content' });
    expect(appendMessages).not.toHaveBeenCalled();
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('does not mint a conversation when the Coach call rejects', async () => {
    callCoach.mockRejectedValue(new Error('upstream 529'));

    await sendCoachChatMessage(ATHLETE, null, 'first ever message', '2026-08-12');

    expect(createConversation).not.toHaveBeenCalled();
  });

  it('stores the turn and the reply together, in order', async () => {
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'should I ride?', '2026-08-12');

    expect(appendMessages).toHaveBeenCalledTimes(1);
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_1', [
      { role: 'athlete', content: 'should I ride?' },
      // Always a list, so a renderer asks one question rather than two
      // (`citations.ts`); empty when the Coach looked nothing up.
      { role: 'coach_ai', content: 'Fuel early.', citations: [] },
    ]);
  });

  it("sends the athlete's turn to the Coach even though it is not stored yet", async () => {
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    getMessages.mockResolvedValue([msg('athlete', 'earlier', 1), msg('coach_ai', 'noted', 2)]);

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'and now?', '2026-08-12');

    expect(callCoach.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'noted' },
      { role: 'user', content: 'and now?' },
    ]);
  });

  it('refuses an empty message without calling the Coach', async () => {
    const result = await sendCoachChatMessage(ATHLETE, 'conv_1', '   ', '2026-08-12');

    expect(result).toEqual({ ok: false, reason: 'empty' });
    expect(callCoach).not.toHaveBeenCalled();
  });

  it("refuses another athlete's conversation without calling the Coach", async () => {
    // The id arrives from the client, so it is a claim to be checked (ADR 0006).
    getOwnedConversation.mockResolvedValue(null);

    const result = await sendCoachChatMessage(ATHLETE, 'conv_someone_else', 'hi', '2026-08-12');

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(callCoach).not.toHaveBeenCalled();
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it('resolves a Reference through an athlete-scoped lookup, not the raw id', async () => {
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    getOwnedSession.mockResolvedValue({
      id: 'sess_1',
      date: '2026-08-18',
      type: 'Recovery',
      status: 'planned',
      duration: 30,
      zone: 'Z1',
      note: 'easy spin',
      origin: 'coach',
      isTraining: true,
    });

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'why this one?', '2026-08-12', undefined, 'sess_1');

    expect(getOwnedSession).toHaveBeenCalledWith('athlete_1', 'sess_1');
    // The session reached the prompt, so the Coach can actually discuss it.
    expect(callCoach.mock.calls[0][0].system).toContain('SESSION DISCUSSION');
    expect(callCoach.mock.calls[0][0].system).toContain('easy spin');
  });

  it('degrades to an ordinary chat when the Reference is not the athlete\'s', async () => {
    // A forged or stale id yields no Reference rather than another athlete's
    // session — and must not fail the message the athlete actually typed.
    getOwnedConversation.mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    getOwnedSession.mockResolvedValue(undefined);

    const result = await sendCoachChatMessage(
      ATHLETE, 'conv_1', 'why this one?', '2026-08-12', undefined, 'sess_not_mine',
    );

    expect(result).toMatchObject({ ok: true });
    expect(callCoach.mock.calls[0][0].system).not.toContain('SESSION DISCUSSION');
  });
});

// code-health/07 — Coach Chat held its own copy of the same invented baseline.
describe('Coach Chat proposes a week (training-architecture/20)', () => {
  // 2026-09-16 is a Wednesday: this week is 09-14..09-20, next is 09-21..09-27.
  const TODAY = '2026-09-16';
  const PLAN = {
    sessions: [{ date: '2026-09-18', type: 'Endurance', durationMinutes: 40, zone: 'Z2', note: null }],
  };

  beforeEach(() => {
    callCoach.mockReset();
    createConversation.mockReset().mockResolvedValue({ id: 'conv_new' });
    getOwnedConversation.mockReset().mockResolvedValue({ id: 'c1', kind: 'coach_chat' });
    appendMessages.mockReset().mockResolvedValue([]);
    getMessages.mockReset().mockResolvedValue([]);
    recordProposal.mockClear();
    getPendingProposal.mockReset().mockResolvedValue(null);
    getDiscussedWeek.mockReset().mockResolvedValue(null);
    logCoachFailure.mockClear();
  });

  it('stages a proposal inside this week’s remainder once the turn is stored, and returns it', async () => {
    callCoach.mockResolvedValue({
      text: 'Here is the week.',
      toolCalls: [{ name: 'propose_week_plan', input: PLAN }],
    });

    const result = await sendCoachChatMessage(ATHLETE, 'c1', 'go', TODAY);

    expect(result).toMatchObject({ ok: true, proposal: { sessions: PLAN.sessions } });
    expect(recordProposal).toHaveBeenCalledWith('athlete_1', 'c1', PLAN.sessions);
    // Stored first, staged second: a proposal must never outlive a turn that
    // failed to persist.
    expect(appendMessages.mock.invocationCallOrder[0]).toBeLessThan(recordProposal.mock.invocationCallOrder[0]);
  });

  it('with a discussed next-week handoff, a next-week proposal is staged and the prompt names that window and the staged week', async () => {
    getDiscussedWeek.mockResolvedValue('2026-09-21');
    const staged = [{ ...PLAN.sessions[0], date: '2026-09-22', note: 'the drafted note' }];
    getPendingProposal.mockResolvedValue({ conversationId: 'c1', sessions: staged });
    const nextWeek = { sessions: [{ ...PLAN.sessions[0], date: '2026-09-23' }] };
    callCoach.mockResolvedValue({ text: 'Revised.', toolCalls: [{ name: 'propose_week_plan', input: nextWeek }] });

    const result = await sendCoachChatMessage(ATHLETE, 'c1', 'more swim', TODAY);

    expect(result).toMatchObject({ ok: true, proposal: { sessions: nextWeek.sessions } });
    expect(getDiscussedWeek).toHaveBeenCalledWith('athlete_1', 'c1');
    const system = callCoach.mock.calls[0][0].system;
    expect(system).toContain('PLANNING WINDOW: 2026-09-21 to 2026-09-27');
    expect(system).toContain('PROPOSED WEEK');
    expect(system).toContain('2026-09-22: Endurance 40min Z2 — the drafted note');
    expect(system).toContain('SAVING THE PLAN');
    expect(system).not.toMatch(/from next \w+day\?/);
  });

  it('a first turn reads no handoff and no pending proposal, and plans this week’s remainder', async () => {
    callCoach.mockResolvedValue({ text: 'Hi.', toolCalls: [] });

    await sendCoachChatMessage(ATHLETE, null, 'hi', TODAY);

    expect(getDiscussedWeek).not.toHaveBeenCalled();
    expect(getPendingProposal).not.toHaveBeenCalled();
    const system = callCoach.mock.calls[0][0].system;
    expect(system).toContain('PLANNING WINDOW: 2026-09-16 to 2026-09-20');
    expect(system).not.toContain('PROPOSED WEEK');
  });

  it('stages nothing when the Coach called no tool at all — and nothing fails after the store', async () => {
    callCoach.mockResolvedValue({ text: 'Just talking.', toolCalls: [] });

    const result = await sendCoachChatMessage(ATHLETE, 'c1', 'hi', TODAY);

    expect(result).toMatchObject({ ok: true, proposal: null });
    expect(recordProposal).not.toHaveBeenCalled();
    expect(logCoachFailure).not.toHaveBeenCalled();
  });

  it('only the proposal tool stages — a lookup call carrying a sessions array is not a proposal', async () => {
    callCoach.mockResolvedValue({
      text: 'Looked it up.',
      toolCalls: [{ name: 'look_up_training_science', input: PLAN }],
    });

    const result = await sendCoachChatMessage(ATHLETE, 'c1', 'why?', TODAY);

    expect(result).toMatchObject({ ok: true, proposal: null });
    expect(recordProposal).not.toHaveBeenCalled();
  });

  it('stages nothing, but still stores the turn, when the plan falls outside the window', async () => {
    // Next week, and no draft was brought in to discuss: not this chat's to write.
    const outside = { sessions: [{ ...PLAN.sessions[0], date: '2026-09-23' }] };
    callCoach.mockResolvedValue({ text: 'Here.', toolCalls: [{ name: 'propose_week_plan', input: outside }] });

    const result = await sendCoachChatMessage(ATHLETE, 'c1', 'go', TODAY);

    expect(result).toMatchObject({ ok: true, proposal: null });
    expect(recordProposal).not.toHaveBeenCalled();
    expect(appendMessages).toHaveBeenCalledTimes(1);
  });
});

describe('the Coach Chat system prompt carries no invented readiness', () => {
  it('sends no readiness scores when the athlete has never given a Check-in', async () => {
    await sendCoachChatMessage(ATHLETE, null, 'how should I pace Sunday?', '2026-08-12');

    const { system } = callCoach.mock.calls[0][0];
    for (const token of READINESS_SCORE_TOKENS) expect(system).not.toMatch(token);
    expect(system).toContain('NO CHECK-IN DATA');
  });

  it('names tune-ups and late races the same way the Weekly Session does (slice 09)', async () => {
    // CodeRabbit on PR #60: Chat knew less than the Weekly Session. Same rows,
    // same lines.
    const target = {
      id: 't', athleteId: 'a', name: 'Ironman Kalmar', date: '2027-08-18', distance: 'Full',
      isTarget: true, createdAt: new Date('2026-06-01T10:00:00Z'),
    };
    const late = {
      ...target, id: 'r3', name: 'Half Aarhus', date: '2026-08-30', distance: 'Half',
      isTarget: false, createdAt: new Date('2026-08-11T12:00:00Z'),
    };
    getTargetRace.mockResolvedValue(target);
    getRaces.mockResolvedValue([target, late]);
    getLatestPlanWrittenAt.mockResolvedValue(new Date('2026-08-10T08:00:00Z'));
    callCoach.mockReset().mockResolvedValue({ text: 'ok', toolCalls: [] });
    createConversation.mockReset().mockResolvedValue({ id: 'conv_new' });
    appendMessages.mockReset().mockResolvedValue([]);
    getMessages.mockReset().mockResolvedValue([]);
    getOwnedConversation.mockReset();

    await sendCoachChatMessage(ATHLETE, null, 'Should I race the half?', '2026-08-12');

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('TUNE-UPS: Half Aarhus on 2026-08-30 (Half)');
    expect(system).toContain('LATE RACE: Half Aarhus on 2026-08-30 (Half)');
  });

  it('derives the phase from the horizon, the same as the Weekly Session', () => {
    // `phase=` used to come from a column written once at onboarding, so Chat
    // and the Weekly Session could disagree about where the athlete was in
    // their season. Both derive it from the Target Race now, so they cannot.
    expect(currentPhase('2026-08-12', trainingBlocks('2026-08-12', '2027-06-01'))).toBe(
      'Block 1 of 5',
    );
  });
});

describe('Coach Chat sees the week', () => {
  beforeEach(() => {
    callCoach.mockReset().mockResolvedValue({ text: 'Fuel early.', toolCalls: [] });
    appendMessages.mockReset().mockResolvedValue([]);
    getMessages.mockReset().mockResolvedValue([]);
    getEquipmentItems.mockClear();
    getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    getOwnedSession.mockReset().mockResolvedValue(undefined);
    getSessionsForWeek.mockReset().mockResolvedValue([]);
  });

  const weekSession = (over: Partial<Session> = {}): Session => ({
    id: 'sess_1',
    date: '2026-08-13',
    type: 'Intensity',
    status: 'planned',
    parked: false,
    dayOrder: 0,
    version: 1,
    title: null,
    duration: 60,
    zone: '4',
    note: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    origin: 'coach',
    isTraining: true,
    ...over,
  });

  // The bug this slice exists for: an athlete asking "should I do tomorrow's
  // intervals?" was talking to a Coach that could not see tomorrow, and it
  // answered confidently anyway.
  it('fetches the athlete’s current week from the Monday of today', async () => {
    getSessionsForWeek.mockResolvedValue([weekSession()]);

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'should I do tomorrow?', '2026-08-12');

    // 2026-08-12 is a Wednesday; its week starts Monday 2026-08-10.
    expect(getSessionsForWeek).toHaveBeenCalledWith('athlete_1', '2026-08-10');
    expect(callCoach.mock.calls[0][0].system).toContain('THIS WEEK');
    expect(callCoach.mock.calls[0][0].system).toContain('Intensity');
  });

  it('renders no week block when the athlete has no sessions this week', async () => {
    getSessionsForWeek.mockResolvedValue([]);

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'hello', '2026-08-12');

    expect(callCoach.mock.calls[0][0].system).not.toContain('THIS WEEK');
  });

  // Entity ids never appear in prompts (CONTEXT.md, Week Activity) — a model
  // that reads an id in its own prompt can recite it back.
  it('puts no session id in the prompt', async () => {
    getSessionsForWeek.mockResolvedValue([weekSession({ id: 'sess_secret' })]);

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'hello', '2026-08-12');

    expect(callCoach.mock.calls[0][0].system).not.toContain('sess_secret');
  });

  it('describes a tapped Reference once, not twice', async () => {
    const tapped = weekSession({ id: 'sess_1', note: 'threshold set, hold 4x8' });
    getSessionsForWeek.mockResolvedValue([tapped]);
    getOwnedSession.mockResolvedValue(tapped);

    await sendCoachChatMessage(
      ATHLETE, 'conv_1', 'why this one?', '2026-08-12', undefined, 'sess_1',
    );

    const system = callCoach.mock.calls[0][0].system;
    expect(system).toContain('SESSION DISCUSSION');
    expect(system.match(/threshold set/g)).toHaveLength(1);
  });
});

describe('the Reference as the prompt sees it', () => {
  beforeEach(() => {
    callCoach.mockReset().mockResolvedValue({ text: 'ok', toolCalls: [] });
    getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    appendMessages.mockReset().mockResolvedValue([]);
    getMessages.mockReset().mockResolvedValue([]);
  });

  it('renders a session with no duration, zone or note with dashes and nothing, not "null"', async () => {
    getOwnedSession.mockReset().mockResolvedValue({
      id: 'sess_1',
      type: 'Recovery',
      date: '2026-08-18',
      duration: null,
      zone: null,
      note: null,
      status: 'planned',
    });

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'this one?', '2026-08-12', undefined, 'sess_1');

    const system = callCoach.mock.calls[0][0].system as string;
    expect(system).toContain('Duration: — · Zone: —');
    expect(system).toContain('Note: ""');
    expect(system).not.toContain('null');
  });

  it('renders the duration in minutes when there is one', async () => {
    getOwnedSession.mockReset().mockResolvedValue({
      id: 'sess_1',
      type: 'Endurance',
      date: '2026-08-18',
      duration: 90,
      zone: 'Z2',
      note: 'steady',
      status: 'planned',
    });

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'this one?', '2026-08-12', undefined, 'sess_1');

    expect(callCoach.mock.calls[0][0].system).toContain('Duration: 90 min · Zone: Z2');
  });
});

describe('the horizon in Coach Chat (training-architecture/07)', () => {
  it('names the Target Race and the block today falls inside, from the same resolver the Weekly Session uses', async () => {
    callCoach.mockReset().mockResolvedValue({ text: 'ok', toolCalls: [] });
    getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    appendMessages.mockReset().mockResolvedValue([]);
    getMessages.mockReset().mockResolvedValue([]);
    getTargetRace.mockResolvedValue({ id: 'r1', name: 'Ironman Kalmar', date: '2027-08-18' });

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'how far out am I?', '2026-08-12');

    const system = callCoach.mock.calls[0][0].system as string;
    expect(system).toContain('race=Ironman Kalmar on 2027-08-18');
    expect(system).toContain('Block 1 of');
    getTargetRace.mockResolvedValue(null);
  });
});

describe('getOpenCoachChat — resume, never mint', () => {
  it('returns null when the athlete has never opened a chat, reading no messages', async () => {
    getLatestOpenConversation.mockResolvedValue(null);
    getMessages.mockReset();
    createConversation.mockReset();

    expect(await getOpenCoachChat(ATHLETE.id)).toBeNull();

    expect(getLatestOpenConversation).toHaveBeenCalledWith(ATHLETE.id, 'coach_chat');
    expect(getMessages).not.toHaveBeenCalled();
    expect(createConversation).not.toHaveBeenCalled();
  });

  it('returns the open conversation with its transcript, and no proposal when nothing is staged', async () => {
    getLatestOpenConversation.mockResolvedValue({ id: 'conv_9', kind: 'coach_chat' });
    getMessages.mockReset().mockResolvedValue([{ id: 'm1', role: 'athlete', content: 'hi', seq: 0 }]);
    getPendingProposal.mockReset().mockResolvedValue(null);

    expect(await getOpenCoachChat(ATHLETE.id)).toEqual({
      conversationId: 'conv_9',
      messages: [{ id: 'm1', role: 'athlete', content: 'hi', seq: 0 }],
      proposal: null,
    });
    expect(getMessages).toHaveBeenCalledWith('conv_9');
  });

  // training-architecture/20: a refresh mid-decision must not lose the card.
  it('restores the pending proposal with the transcript', async () => {
    getLatestOpenConversation.mockResolvedValue({ id: 'conv_9', kind: 'coach_chat' });
    getMessages.mockReset().mockResolvedValue([]);
    const sessions = [{ date: '2026-09-18', type: 'Endurance', durationMinutes: 40, zone: 'Z2', note: null }];
    getPendingProposal.mockReset().mockResolvedValue({ conversationId: 'conv_9', sessions });

    expect(await getOpenCoachChat(ATHLETE.id)).toEqual({ conversationId: 'conv_9', messages: [], proposal: { sessions } });
    expect(getPendingProposal).toHaveBeenCalledWith(ATHLETE.id, 'conv_9');
  });
});

describe('sendCoachChatMessage — the Coach can look things up (knowledge-oracle/05)', () => {
  beforeEach(() => {
    callCoach.mockReset().mockResolvedValue({ text: 'Keep Thursday easy.', toolCalls: [] });
    createConversation.mockReset().mockResolvedValue({ id: 'conv_new' });
    getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', kind: 'coach_chat' });
    appendMessages.mockReset().mockResolvedValue([]);
    getMessages.mockReset().mockResolvedValue([]);
    productionGrounding.mockClear();
    logCoachDrift.mockClear();
  });

  it('offers the week proposal and the lookup on every turn, and routes each call to its answer (training-architecture/20)', async () => {
    await sendCoachChatMessage(ATHLETE, 'conv_1', 'why is Thursday easy?', '2026-08-12');

    expect(productionGrounding).toHaveBeenCalledTimes(1);
    expect(productionGrounding).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: 'athlete_1', surface: 'coach_chat', conversationId: 'conv_1' }),
    );
    const params = callCoach.mock.calls[0][0];
    expect(params.tools.map((t: { name: string }) => t.name)).toEqual([
      'propose_week_plan',
      'look_up_training_science',
    ]);
    // One resolver answers both: the lookup goes to the grounding, the proposal
    // gets the fixed acknowledgement — the Weekly Session's exact wiring.
    await expect(params.resolveTool({ name: 'look_up_training_science', input: { question: 'q' } })).resolves.toBe(
      '[1] passage',
    );
    expect(groundingResolve).toHaveBeenCalledWith({ name: 'look_up_training_science', input: { question: 'q' } });
    await expect(params.resolveTool({ name: 'propose_week_plan', input: {} })).resolves.toBe(PROPOSAL_ACK);
  });

  it('threads the phase and experience level from the Check-in into the grounding', async () => {
    getTargetRace.mockResolvedValue({ name: 'IM', date: '2027-08-15' });
    await sendCoachChatMessage(ATHLETE, 'conv_1', 'how much Z2?', '2026-08-12');
    expect(productionGrounding).toHaveBeenCalledWith(
      expect.objectContaining({ experienceLevel: 'intermediate', phase: expect.stringMatching(/^Block \d of \d$/) }),
    );
    getTargetRace.mockResolvedValue(null);
  });

  it('stores the citations the grounding supplied on the Coach reply, and none when there were none', async () => {
    productionGrounding.mockReturnValueOnce({
      tool: { name: 'look_up_training_science', description: 'd', input_schema: { type: 'object' } },
      resolve: groundingResolve,
      citations: () => [GROUNDING_CITATION],
    });
    await sendCoachChatMessage(ATHLETE, 'conv_1', 'why?', '2026-08-12');
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_1', [
      { role: 'athlete', content: 'why?' },
      { role: 'coach_ai', content: 'Keep Thursday easy.', citations: [GROUNDING_CITATION] },
    ]);

    appendMessages.mockClear();
    await sendCoachChatMessage(ATHLETE, 'conv_1', 'thanks', '2026-08-12');
    expect(appendMessages.mock.calls[0][2][1]).toEqual({ role: 'coach_ai', content: 'Keep Thursday easy.', citations: [] });
  });

  it('logs a source mention in the reply and stores the reply untouched — never rewrites', async () => {
    callCoach.mockResolvedValue({ text: 'Polarised works [1], according to the study.', toolCalls: [] });

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'why?', '2026-08-12');

    expect(logCoachDrift).toHaveBeenCalledWith({
      surface: 'coach_chat',
      athleteId: 'athlete_1',
      conversationId: 'conv_1',
      patterns: ['bracket-marker', 'according-to-study'],
    });
    expect(appendMessages.mock.calls[0][2][1].content).toBe('Polarised works [1], according to the study.');
  });

  it('logs nothing about drift for an ordinary reply', async () => {
    await sendCoachChatMessage(ATHLETE, 'conv_1', 'why?', '2026-08-12');
    expect(logCoachDrift).not.toHaveBeenCalled();
  });
});

describe('what the athlete’s body allows reaches Coach Chat too (training-architecture/06)', () => {
  // CodeRabbit on PR #60: Chat received no capacity block at all, and Chat is
  // where "should I do tomorrow's intervals?" gets asked. Same read, same
  // sentence as the Weekly Session — only the capacity half, never the thread.
  it('states the capacity when something is restricted, and nothing when not', async () => {
    callCoach.mockReset().mockResolvedValue({ text: 'ok', toolCalls: [] });
    createConversation.mockReset().mockResolvedValue({ id: 'conv_new' });
    appendMessages.mockReset().mockResolvedValue([]);
    getMessages.mockReset().mockResolvedValue([]);
    getOwnedConversation.mockReset();

    capacityFor.mockResolvedValue(
      'CAPACITY (what the athlete can do right now — not a diagnosis): no run · bike easy only.',
    );
    await sendCoachChatMessage(ATHLETE, null, 'intervals tomorrow?', '2026-08-12');
    expect(capacityFor).toHaveBeenCalledWith('athlete_1');
    expect(callCoach.mock.calls[0][0].system).toContain('no run');

    callCoach.mockClear();
    capacityFor.mockResolvedValue(null);
    await sendCoachChatMessage(ATHLETE, null, 'intervals tomorrow?', '2026-08-12');
    expect(callCoach.mock.calls[0][0].system).not.toContain('CAPACITY');
  });
});
