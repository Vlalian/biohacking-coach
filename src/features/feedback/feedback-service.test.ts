import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from '@/features/coach/conversation';
import { TRUST_SIGNAL_QUESTION } from './feedback-prompt';

const {
  callCoach,
  createConversation,
  getOwnedConversation,
  getLatestOpenConversation,
  appendMessages,
  getMessages,
  recordTrustSignal,
  hasTrustSignal,
  logCoachFailure,
} = vi.hoisted(() => ({
  callCoach: vi.fn(),
  createConversation: vi.fn(),
  getOwnedConversation: vi.fn(),
  getLatestOpenConversation: vi.fn(),
  appendMessages: vi.fn(),
  getMessages: vi.fn(),
  recordTrustSignal: vi.fn(() => Promise.resolve()),
  hasTrustSignal: vi.fn(() => Promise.resolve(false)),
  logCoachFailure: vi.fn(),
}));

vi.mock('@/features/coach/coach-client', () => ({ callCoach }));
vi.mock('@/features/coach/conversation-repository', () => ({
  createConversation,
  getOwnedConversation,
  getLatestOpenConversation,
  appendMessages,
  getMessages,
}));
vi.mock('./feedback-repository', () => ({
  recordTrustSignal,
  hasTrustSignal,
  recordFallback: vi.fn(),
}));
vi.mock('@/lib/coach-log', () => ({ logCoachFailure }));

const { getOpenInterview, sendFeedbackTurn } = await import('./feedback-service');

function turn(role: Message['role'], seq: number, content = 'x'): Message {
  return { id: `m${seq}`, role, content, seq, createdAt: new Date('2026-09-01T09:00:00Z') };
}

describe('getOpenInterview', () => {
  beforeEach(() => {
    getLatestOpenConversation.mockReset().mockResolvedValue(null);
    getMessages.mockReset().mockResolvedValue([]);
    createConversation.mockReset();
    callCoach.mockReset();
  });

  it('creates nothing and calls no model for a tester who has never opened it', async () => {
    // Opening the escape hatch must be free. A tester who looks and leaves must
    // not leave an empty interview behind, and must not spend a model call.
    const state = await getOpenInterview('athlete_1');

    expect(state).toBeNull();
    expect(createConversation).not.toHaveBeenCalled();
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('resumes an interview the tester left, with its transcript intact', async () => {
    getLatestOpenConversation.mockResolvedValue({ id: 'conv_1' });
    getMessages.mockResolvedValue([turn('athlete', 0, 'the plan was wrong')]);

    const state = await getOpenInterview('athlete_1');

    expect(getLatestOpenConversation).toHaveBeenCalledWith('athlete_1', 'feedback');
    expect(state).toEqual({
      conversationId: 'conv_1',
      messages: [expect.objectContaining({ content: 'the plan was wrong' })],
    });
  });
});

describe('sendFeedbackTurn', () => {
  beforeEach(() => {
    callCoach.mockReset().mockResolvedValue({ text: 'Which session was it?', toolCalls: [] });
    createConversation.mockReset().mockResolvedValue({ id: 'conv_new' });
    getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1' });
    appendMessages.mockReset().mockResolvedValue([]);
    getMessages.mockReset().mockResolvedValue([]);
    recordTrustSignal.mockClear();
    hasTrustSignal.mockReset().mockResolvedValue(false);
    logCoachFailure.mockClear();
  });

  it('refuses an empty turn without touching anything', async () => {
    const result = await sendFeedbackTurn('athlete_1', 'conv_1', '   ');

    expect(result).toEqual({ ok: false, reason: 'empty' });
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('refuses a conversation that is not this tester’s', async () => {
    // ADR 0006: a client-supplied id is checked against the owner resolved from
    // the session, never trusted.
    getOwnedConversation.mockResolvedValue(null);

    const result = await sendFeedbackTurn('athlete_1', 'someone_elses', 'hello');

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('creates the interview lazily, on the first thing the tester actually says', async () => {
    const result = await sendFeedbackTurn('athlete_1', null, 'the coach kept nagging me');

    expect(createConversation).toHaveBeenCalledWith({ athleteId: 'athlete_1', kind: 'feedback' });
    expect(result).toMatchObject({ ok: true, conversationId: 'conv_new' });
  });

  it('asks no ownership question on a first turn', async () => {
    // There is nothing to own yet. Looking up a null id would either throw or —
    // worse, and this is what the mutation gate caught — quietly resolve to some
    // other row and start the interview against it.
    await sendFeedbackTurn('athlete_1', null, 'first thing');

    expect(getOwnedConversation).not.toHaveBeenCalled();
  });

  it('stores the turn and the reply together, after the model has answered', async () => {
    await sendFeedbackTurn('athlete_1', 'conv_1', 'the plan was too hard');

    expect(appendMessages).toHaveBeenCalledTimes(1);
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_1', [
      { role: 'athlete', content: 'the plan was too hard' },
      { role: 'coach_ai', content: 'Which session was it?' },
    ]);
  });

  it('writes nothing when the model call fails — no question without an answer', async () => {
    callCoach.mockRejectedValue(new Error('upstream 529'));

    const result = await sendFeedbackTurn('athlete_1', 'conv_1', 'it broke');

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(appendMessages).not.toHaveBeenCalled();
    expect(createConversation).not.toHaveBeenCalled();
  });

  it('logs a failed interview turn as its own surface', async () => {
    // `showable-version/05` item 2: a tester who churned after a failure looked
    // exactly like a tester who stopped caring. The interview is the surface
    // where that matters most — it is the one they reached to complain.
    callCoach.mockRejectedValue(new Error('upstream 529'));

    await sendFeedbackTurn('athlete_1', 'conv_1', 'it broke');

    expect(logCoachFailure).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'feedback', athleteId: 'athlete_1' }),
    );
  });

  it('sends the interviewer’s prompt, never a Coach prompt', async () => {
    // The structural half of "a feedback transcript never reaches
    // buildChatPrompt or renderWeeklyPrompt": whatever else changes, the system
    // prompt this surface sends says it is not the Coach.
    await sendFeedbackTurn('athlete_1', 'conv_1', 'hello');

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toMatch(/not the Coach/i);
    expect(system).not.toMatch(/You are Coach/);
  });

  it('sends only the tester’s own words on a first turn', async () => {
    // No history to send, and nothing invented in its place — the interviewer
    // must not be handed an opening turn the tester never took.
    await sendFeedbackTurn('athlete_1', null, 'the coach kept nagging me');

    expect(callCoach.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'the coach kept nagging me' },
    ]);
  });

  it('refuses when the append is rejected as not this tester’s', async () => {
    // The second ownership check, after the model call: the repository refuses a
    // write to a conversation that is not theirs, and the service must report
    // that rather than returning a success with no stored turn.
    appendMessages.mockResolvedValue(null);

    const result = await sendFeedbackTurn('athlete_1', 'conv_1', 'hello');

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
  });

  it('sends the transcript as history, so follow-ups have something to follow', async () => {
    getMessages.mockResolvedValue([
      turn('athlete', 0, 'the long run was too long'),
      turn('coach_ai', 1, 'Which week was that?'),
    ]);

    await sendFeedbackTurn('athlete_1', 'conv_1', 'week three');

    expect(callCoach.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'the long run was too long' },
      { role: 'assistant', content: 'Which week was that?' },
      { role: 'user', content: 'week three' },
    ]);
  });

  it('does not ask the Trust Signal early in the interview', async () => {
    await sendFeedbackTurn('athlete_1', 'conv_1', 'first thing');

    expect(callCoach.mock.calls[0][0].system).not.toContain(TRUST_SIGNAL_QUESTION);
  });

  it('asks the Trust Signal once the interview has run its course', async () => {
    getMessages.mockResolvedValue([
      turn('athlete', 0),
      turn('coach_ai', 1),
      turn('athlete', 2),
      turn('coach_ai', 3),
    ]);

    await sendFeedbackTurn('athlete_1', 'conv_1', 'third thing');

    expect(callCoach.mock.calls[0][0].system).toContain(TRUST_SIGNAL_QUESTION);
  });

  it('stores the tester’s answer to the Trust Signal against this interview', async () => {
    getMessages.mockResolvedValue([
      turn('athlete', 0),
      turn('coach_ai', 1, `Right. ${TRUST_SIGNAL_QUESTION}`),
    ]);

    await sendFeedbackTurn('athlete_1', 'conv_1', 'no, I would have rested');

    expect(recordTrustSignal).toHaveBeenCalledWith({
      athleteId: 'athlete_1',
      conversationId: 'conv_1',
      body: 'no, I would have rested',
    });
  });

  it('does not store a second answer once one exists', async () => {
    hasTrustSignal.mockResolvedValue(true);
    getMessages.mockResolvedValue([
      turn('athlete', 0),
      turn('coach_ai', 1, `Right. ${TRUST_SIGNAL_QUESTION}`),
    ]);

    await sendFeedbackTurn('athlete_1', 'conv_1', 'asked again');

    expect(recordTrustSignal).not.toHaveBeenCalled();
  });

  it('does not store an answer the model never got', async () => {
    callCoach.mockRejectedValue(new Error('upstream 529'));
    getMessages.mockResolvedValue([
      turn('athlete', 0),
      turn('coach_ai', 1, `Right. ${TRUST_SIGNAL_QUESTION}`),
    ]);

    await sendFeedbackTurn('athlete_1', 'conv_1', 'no, I would have rested');

    expect(recordTrustSignal).not.toHaveBeenCalled();
  });
});
