import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveAthleteWithLanguage, assertAiCoachingConsent, sendCoachChatMessage } =
  vi.hoisted(() => ({
    resolveAthleteWithLanguage: vi.fn(),
    assertAiCoachingConsent: vi.fn(),
    sendCoachChatMessage: vi.fn(),
  }));

vi.mock('./current-actor', () => ({ resolveAthleteWithLanguage }));
vi.mock('@/features/consent/consent-gate', () => ({ assertAiCoachingConsent }));
vi.mock('@/features/coach/coach-chat-service', () => ({ sendCoachChatMessage }));

const { sendCoachChatMessageAction } = await import('./chat-actions');

/**
 * The consent gate is what makes this more than a wrapper: athlete free text
 * reaches a hosted LLM, and that is conditional on explicit consent (GDPR
 * decision A). The gate must run *before* the message is sent — a refusal that
 * still called the API would already have disclosed the text it was refusing.
 */
const ATHLETE = { id: 'athlete_1', raceTarget: 'Ironman Copenhagen' };
const INPUT = { conversationId: null, content: 'How should I fuel the long ride?' };

beforeEach(() => {
  resolveAthleteWithLanguage.mockReset();
  assertAiCoachingConsent.mockReset();
  sendCoachChatMessage.mockReset();
});

describe('sendCoachChatMessageAction', () => {
  it('sends as the resolved athlete, carrying their language and any Reference', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({
      ok: true,
      athlete: ATHLETE,
      language: 'da',
    });
    assertAiCoachingConsent.mockResolvedValue({ ok: true });
    sendCoachChatMessage.mockResolvedValue({ ok: true });

    const result = await sendCoachChatMessageAction({
      ...INPUT,
      referenceSessionId: 'sess_9',
    });

    expect(result).toEqual({ ok: true });
    // The Reference travels as an id the server re-resolves (ADR 0006), and
    // the date is the server's, not the browser's.
    expect(sendCoachChatMessage).toHaveBeenCalledWith(
      ATHLETE,
      null,
      INPUT.content,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      'da',
      'sess_9',
    );
  });

  it('normalises a missing Reference to null rather than undefined', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({ ok: true, athlete: ATHLETE });
    assertAiCoachingConsent.mockResolvedValue({ ok: true });
    sendCoachChatMessage.mockResolvedValue({ ok: true });

    await sendCoachChatMessageAction(INPUT);

    expect(sendCoachChatMessage).toHaveBeenCalledWith(
      ATHLETE,
      null,
      INPUT.content,
      expect.any(String),
      undefined,
      null,
    );
  });

  it('refuses without consent, before any text reaches the Coach', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({ ok: true, athlete: ATHLETE });
    assertAiCoachingConsent.mockResolvedValue({ ok: false });

    const result = await sendCoachChatMessageAction(INPUT);

    expect(result).toEqual({ ok: false, reason: 'consent-required' });
    expect(sendCoachChatMessage).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request without even checking consent', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({
      ok: false,
      reason: 'not-authenticated',
    });

    const result = await sendCoachChatMessageAction(INPUT);

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(assertAiCoachingConsent).not.toHaveBeenCalled();
    expect(sendCoachChatMessage).not.toHaveBeenCalled();
  });
});
