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
  getLatestOpenConversation: vi.fn(),
}));
vi.mock('./check-in-repository', () => ({
  // No Check-in filed: the ordinary week, and the one the prompt has to say it
  // has nothing for rather than inventing scores.
  getCheckInForWeek: vi.fn(async () => null),
}));
const { getTargetRace, getRaces, getLatestPlanWrittenAt } = vi.hoisted(() => ({
  // No race booked: the ordinary state for most of these fixtures, and the one
  // the prompt has to state plainly rather than omit.
  getTargetRace: vi.fn<() => Promise<unknown>>(async () => null),
  getRaces: vi.fn<() => Promise<unknown[]>>(async () => []),
  getLatestPlanWrittenAt: vi.fn<() => Promise<Date | null>>(async () => null),
}));
vi.mock('@/features/race/race-repository', () => ({ getTargetRace, getRaces }));
vi.mock('./plan-proposal-repository', () => ({ getLatestPlanWrittenAt }));
vi.mock('@/features/equipment/equipment-repository', () => ({ getEquipmentItems }));
vi.mock('@/features/session/session-repository', () => ({
  getOwnedSession,
  getSessionsForWeek,
}));

const { sendCoachChatMessage } = await import('./coach-chat-service');
// Coach Chat's history is the shared conversion with no primer — the athlete
// speaks first here, so there is no fabricated opening turn. Imported from the
// shared module rather than re-exported by the service, so the test asserts the
// behaviour Coach Chat actually gets.
const { toApiMessages } = await import('./conversation');

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

  it('offers the lookup tool on every turn, with its resolver, built for this athlete and surface', async () => {
    await sendCoachChatMessage(ATHLETE, 'conv_1', 'why is Thursday easy?', '2026-08-12');

    expect(productionGrounding).toHaveBeenCalledTimes(1);
    expect(productionGrounding).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: 'athlete_1', surface: 'coach_chat', conversationId: 'conv_1' }),
    );
    const params = callCoach.mock.calls[0][0];
    expect(params.tools.map((t: { name: string }) => t.name)).toEqual(['look_up_training_science']);
    expect(params.resolveTool).toBe(groundingResolve);
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
