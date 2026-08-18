import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from './conversation';
import { READINESS_SCORE_TOKENS } from '@/test/readiness-tokens';

const {
  callCoach,
  createConversation,
  getOwnedConversation,
  appendMessages,
  getMessages,
  getEquipmentItems,
  getOwnedSession,
  getSessionsForWeek,
} = vi.hoisted(() => ({
  callCoach: vi.fn(),
  createConversation: vi.fn(),
  getOwnedConversation: vi.fn(),
  appendMessages: vi.fn(),
  getMessages: vi.fn(),
  getEquipmentItems: vi.fn(() => Promise.resolve([])),
  getOwnedSession: vi.fn(),
  getSessionsForWeek: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./coach-client', () => ({ callCoach }));
vi.mock('./conversation-repository', () => ({
  createConversation,
  getOwnedConversation,
  appendMessages,
  getMessages,
  getLatestOpenConversation: vi.fn(),
}));
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
  trainingPhase: 'Peak',
  experienceLevel: 'intermediate',
  communicationStyle: null,
  raceTarget: 'Ironman Kona',
  trainingSessionsPerWeek: null,
  profile: null,
} as unknown as Parameters<typeof sendCoachChatMessage>[0];

function msg(role: Message['role'], content: string, seq: number): Message {
  return { id: `m${seq}`, role, content, seq, createdAt: new Date('2026-08-12T09:00:00Z') };
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
    getOwnedConversation.mockResolvedValue({ id: 'conv_1' });

    const result = await sendCoachChatMessage(ATHLETE, 'conv_1', 'again', '2026-08-12');

    expect(createConversation).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, conversationId: 'conv_1' });
  });

  it('reports coach-unavailable when the Coach call rejects', async () => {
    getOwnedConversation.mockResolvedValue({ id: 'conv_1' });
    callCoach.mockRejectedValue(new Error('upstream 529'));

    const result = await sendCoachChatMessage(ATHLETE, 'conv_1', 'should I ride?', '2026-08-12');

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
  });

  it('writes nothing when the Coach call rejects — no question without an answer', async () => {
    // The failure mode this ordering exists to prevent: the athlete's turn
    // persisted, the reply never arriving, and a retry duplicating the message.
    getOwnedConversation.mockResolvedValue({ id: 'conv_1' });
    callCoach.mockRejectedValue(new Error('upstream 529'));

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'should I ride?', '2026-08-12');

    expect(appendMessages).not.toHaveBeenCalled();
  });

  it('reports unsafe-content when prompt rendering refuses an identifier', async () => {
    // A session note is free text and unvalidated, so an athlete who typed an
    // email into one and then discussed that session hits the prompt builder's
    // assertion. Told apart from coach-unavailable deliberately: "try again"
    // is useless advice for content that will be refused identically.
    getOwnedConversation.mockResolvedValue({ id: 'conv_1' });
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
    getOwnedConversation.mockResolvedValue({ id: 'conv_1' });

    await sendCoachChatMessage(ATHLETE, 'conv_1', 'should I ride?', '2026-08-12');

    expect(appendMessages).toHaveBeenCalledTimes(1);
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_1', [
      { role: 'athlete', content: 'should I ride?' },
      { role: 'coach_ai', content: 'Fuel early.' },
    ]);
  });

  it("sends the athlete's turn to the Coach even though it is not stored yet", async () => {
    getOwnedConversation.mockResolvedValue({ id: 'conv_1' });
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
    getOwnedConversation.mockResolvedValue({ id: 'conv_1' });
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
    getOwnedConversation.mockResolvedValue({ id: 'conv_1' });
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
    expect(system).toContain('phase=Peak');
  });
});
