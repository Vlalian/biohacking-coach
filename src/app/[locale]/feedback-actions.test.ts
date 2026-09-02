import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  resolveAthleteWithLanguage,
  resolveAthleteId,
  assertAiCoachingConsent,
  sendFeedbackTurn,
  recordFallback,
} = vi.hoisted(() => ({
  resolveAthleteWithLanguage: vi.fn(),
  resolveAthleteId: vi.fn(),
  assertAiCoachingConsent: vi.fn(),
  sendFeedbackTurn: vi.fn(),
  recordFallback: vi.fn(() => Promise.resolve()),
}));

vi.mock('./current-actor', () => ({ resolveAthleteWithLanguage, resolveAthleteId }));
vi.mock('@/features/consent/consent-gate', () => ({ assertAiCoachingConsent }));
vi.mock('@/features/feedback/feedback-service', () => ({ sendFeedbackTurn }));
vi.mock('@/features/feedback/feedback-repository', () => ({ recordFallback }));

const { sendFeedbackTurnAction, submitFallbackFeedbackAction } = await import(
  './feedback-actions'
);

describe('sendFeedbackTurnAction', () => {
  beforeEach(() => {
    resolveAthleteWithLanguage
      .mockReset()
      .mockResolvedValue({ ok: true, athlete: { id: 'athlete_1' }, language: 'Dansk' });
    assertAiCoachingConsent.mockReset().mockResolvedValue({ ok: true });
    sendFeedbackTurn.mockReset().mockResolvedValue({ ok: true, conversationId: 'c1', messages: [] });
  });

  it('refuses a signed-out caller before anything else', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({ ok: false, reason: 'not-authenticated' });

    expect(await sendFeedbackTurnAction({ conversationId: null, content: 'hi' })).toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(sendFeedbackTurn).not.toHaveBeenCalled();
  });

  it('runs the AI consent gate before assembling a prompt', async () => {
    // The interview makes a model call carrying the tester's free text, so it
    // is gated exactly as Coach Chat is (gdpr-decisions item A).
    assertAiCoachingConsent.mockResolvedValue({ ok: false });

    expect(await sendFeedbackTurnAction({ conversationId: null, content: 'hi' })).toEqual({
      ok: false,
      reason: 'consent-required',
    });
    expect(sendFeedbackTurn).not.toHaveBeenCalled();
  });

  it('passes the athlete’s own id and language through to the service', async () => {
    await sendFeedbackTurnAction({ conversationId: 'c1', content: 'the plan was wrong' });

    expect(sendFeedbackTurn).toHaveBeenCalledWith(
      'athlete_1',
      'c1',
      'the plan was wrong',
      'Dansk',
    );
  });
});

describe('submitFallbackFeedbackAction', () => {
  beforeEach(() => {
    resolveAthleteId.mockReset().mockResolvedValue('athlete_1');
    assertAiCoachingConsent.mockReset().mockResolvedValue({ ok: false });
    recordFallback.mockClear();
  });

  it('stores the text with the View the tester was on', async () => {
    const result = await submitFallbackFeedbackAction({
      body: 'the calendar never loaded',
      view: 'training-plan',
      coachFailureReason: null,
    });

    expect(result).toEqual({ ok: true });
    expect(recordFallback).toHaveBeenCalledWith({
      athleteId: 'athlete_1',
      body: 'the calendar never loaded',
      view: 'training-plan',
      coachFailureReason: null,
    });
  });

  it('submits even when the athlete has not consented to AI coaching', async () => {
    // The whole point of the fallback. The escape hatch can never hard-depend on
    // a model call *or* on a gate — a tester who withdrew consent, or whose
    // Coach is broken, is the tester with the most to say.
    const result = await submitFallbackFeedbackAction({
      body: 'I withdrew consent and now nothing works',
      view: 'privacy',
      coachFailureReason: null,
    });

    expect(result).toEqual({ ok: true });
    expect(assertAiCoachingConsent).not.toHaveBeenCalled();
  });

  it('keeps the reason the Coach could not answer', async () => {
    await submitFallbackFeedbackAction({
      body: 'it kept failing',
      view: null,
      coachFailureReason: 'coach-unavailable',
    });

    expect(recordFallback).toHaveBeenCalledWith(
      expect.objectContaining({ coachFailureReason: 'coach-unavailable' }),
    );
  });

  it('refuses an empty submission', async () => {
    expect(
      await submitFallbackFeedbackAction({ body: '   ', view: null, coachFailureReason: null }),
    ).toEqual({ ok: false, reason: 'empty' });
    expect(recordFallback).not.toHaveBeenCalled();
  });

  it('refuses a signed-out caller', async () => {
    resolveAthleteId.mockResolvedValue(null);

    expect(
      await submitFallbackFeedbackAction({ body: 'hello', view: null, coachFailureReason: null }),
    ).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(recordFallback).not.toHaveBeenCalled();
  });

  it('does not store an unknown failure reason it was handed', async () => {
    // The reason is client-supplied and ends up in a log-shaped column. Narrowed
    // to the refusals the app actually produces rather than echoing a string a
    // request chose.
    await submitFallbackFeedbackAction({
      body: 'x',
      view: null,
      coachFailureReason: 'anything-i-like' as never,
    });

    expect(recordFallback).toHaveBeenCalledWith(
      expect.objectContaining({ coachFailureReason: null }),
    );
  });
});
