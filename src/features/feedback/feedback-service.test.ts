import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from '@/features/coach/conversation';
import { DirectIdentifierError } from '@/lib/identifiers';
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
    getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', kind: 'feedback' });
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
    // Three stored tester turns: the third carried the ask, so this one is the
    // answer to it. Position, not the interviewer's wording — the prompt is free
    // to lead into the question however it likes.
    getMessages.mockResolvedValue([
      turn('athlete', 0),
      turn('coach_ai', 1),
      turn('athlete', 2),
      turn('coach_ai', 3),
      turn('athlete', 4),
      turn('coach_ai', 5, 'And if nobody had told you — same call?'),
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
    // Three stored tester turns: the third carried the ask, so this one is the
    // answer to it. Position, not the interviewer's wording — the prompt is free
    // to lead into the question however it likes.
    getMessages.mockResolvedValue([
      turn('athlete', 0),
      turn('coach_ai', 1),
      turn('athlete', 2),
      turn('coach_ai', 3),
      turn('athlete', 4),
      turn('coach_ai', 5, 'And if nobody had told you — same call?'),
    ]);

    await sendFeedbackTurn('athlete_1', 'conv_1', 'asked again');

    expect(recordTrustSignal).not.toHaveBeenCalled();
  });

  it('does not store an answer the model never got', async () => {
    callCoach.mockRejectedValue(new Error('upstream 529'));
    // Three stored tester turns: the third carried the ask, so this one is the
    // answer to it. Position, not the interviewer's wording — the prompt is free
    // to lead into the question however it likes.
    getMessages.mockResolvedValue([
      turn('athlete', 0),
      turn('coach_ai', 1),
      turn('athlete', 2),
      turn('coach_ai', 3),
      turn('athlete', 4),
      turn('coach_ai', 5, 'And if nobody had told you — same call?'),
    ]);

    await sendFeedbackTurn('athlete_1', 'conv_1', 'no, I would have rested');

    expect(recordTrustSignal).not.toHaveBeenCalled();
  });
});

describe('what the tester is told when a turn is refused', () => {
  beforeEach(() => {
    callCoach.mockReset();
    getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', kind: 'feedback' });
    getMessages.mockReset().mockResolvedValue([]);
    appendMessages.mockReset().mockResolvedValue([]);
    createConversation.mockReset().mockResolvedValue({ id: 'conv_new' });
    hasTrustSignal.mockReset().mockResolvedValue(false);
    recordTrustSignal.mockReset().mockResolvedValue(undefined);
  });

  it('never shows the tester unsafe-content, which cannot happen on this surface', async () => {
    // The interview prompt assembles nothing from the athlete's record, so the
    // identifier assertion has nothing to throw over. Should one ever arrive
    // anyway, the tester gets the refusal that invites a retry rather than a
    // sentence telling them to edit content they did not write.
    callCoach.mockRejectedValue(new DirectIdentifierError('email'));

    const result = await sendFeedbackTurn('athlete_1', 'conv_1', 'the plan was wrong');

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
  });

  it('passes every other refusal through as it is', async () => {
    const result = await sendFeedbackTurn('athlete_1', 'conv_1', '   ');

    expect(result).toEqual({ ok: false, reason: 'empty' });
  });

  it('reports a conversation that is not this tester’s as not-owner', async () => {
    getOwnedConversation.mockResolvedValue(null);

    const result = await sendFeedbackTurn('athlete_1', 'conv_other', 'let me in');

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
  });

  it('stores the Trust Signal answer trimmed, as the transcript stores it', async () => {
    // The turn and the answer are the same words; storing one padded and the
    // other not would make the two disagree for whoever reads them side by side.
    callCoach.mockResolvedValue({ text: 'Thanks.', toolCalls: [] });
    getMessages.mockResolvedValue([
      turn('athlete', 0),
      turn('coach_ai', 1),
      turn('athlete', 2),
      turn('coach_ai', 3),
      turn('athlete', 4),
      turn('coach_ai', 5, 'And if nobody had told you — same call?'),
    ]);

    await sendFeedbackTurn('athlete_1', 'conv_1', '  no, I would have rested  ');

    expect(recordTrustSignal).toHaveBeenCalledWith({
      athleteId: 'athlete_1',
      conversationId: 'conv_1',
      body: 'no, I would have rested',
    });
  });
});

describe('work that runs after the turn is stored', () => {
  beforeEach(() => {
    callCoach.mockReset().mockResolvedValue({ text: 'Thanks.', toolCalls: [] });
    getOwnedConversation.mockReset().mockResolvedValue({ id: 'conv_1', kind: 'feedback' });
    appendMessages.mockReset().mockResolvedValue([]);
    createConversation.mockReset().mockResolvedValue({ id: 'conv_new' });
    hasTrustSignal.mockReset().mockResolvedValue(false);
    recordTrustSignal.mockReset().mockResolvedValue(undefined);
    logCoachFailure.mockReset();
    getMessages.mockReset().mockResolvedValue([
      turn('athlete', 0),
      turn('coach_ai', 1),
      turn('athlete', 2),
      turn('coach_ai', 3),
      turn('athlete', 4),
      turn('coach_ai', 5, 'And if nobody had told you — same call?'),
    ]);
  });

  it('logs nothing on a turn that has no after-the-write work', async () => {
    // Most turns carry none. Calling an absent `onStored` would throw a
    // TypeError straight into the catch above, so every ordinary turn would file
    // a failure for work it was never asked to do — and the log is read to tell
    // a broken surface from a quiet one.
    getMessages.mockResolvedValue([turn('athlete', 0), turn('coach_ai', 1)]);

    const result = await sendFeedbackTurn('athlete_1', 'conv_1', 'second thing');

    expect(result.ok).toBe(true);
    expect(recordTrustSignal).not.toHaveBeenCalled();
    expect(logCoachFailure).not.toHaveBeenCalled();
  });

  it('keeps the turn when recording the Trust Signal answer fails', async () => {
    // The turn is already written by the time this runs. Letting the failure out
    // would report a refusal for a turn the tester can see in the transcript,
    // and their retry would append the same message and reply a second time —
    // the exact duplicate the write ordering exists to prevent, arriving through
    // the back door. The answer is lost instead, and the log says so.
    recordTrustSignal.mockRejectedValue(new Error('unique violation'));

    const result = await sendFeedbackTurn('athlete_1', 'conv_1', 'no, I would have rested');

    expect(result.ok).toBe(true);
    expect(logCoachFailure).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'feedback', reason: 'after-store' }),
    );
  });
});
