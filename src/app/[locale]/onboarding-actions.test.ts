import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, getAthleteByUserId, answerOnboardingStep, setUiLanguage } = vi.hoisted(
  () => ({
    getSession: vi.fn(),
    getAthleteByUserId: vi.fn(),
    answerOnboardingStep: vi.fn(),
    setUiLanguage: vi.fn(),
  }),
);

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/onboarding/onboarding-service', () => ({ answerOnboardingStep }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ setUiLanguage }));

const { answerOnboardingAction } = await import('./onboarding-actions');

/**
 * Onboarding is where identity and training data are closest together, and the
 * action is the seam that keeps them apart. Two rules live here rather than in
 * the service, so they are asserted here:
 *
 *   1. The greeting is computed twice on purpose. The one that is *persisted*
 *      carries no name — `messages` is a training-side table keyed by athlete
 *      id and must never hold one (ADR 0006). The personalised one exists only
 *      in the response, for display.
 *   2. The language preference is written only after the step is accepted, so a
 *      payload the closed-set validation rejects cannot leave a preference
 *      behind.
 */
const USER = { id: 'user_1', name: 'Mads Kilstrup' };
const ATHLETE = { id: 'athlete_1', profile: { onboardingAnswers: {} } };

beforeEach(() => {
  getSession.mockReset();
  getAthleteByUserId.mockReset();
  answerOnboardingStep.mockReset();
  setUiLanguage.mockReset();
});

function signedIn() {
  getSession.mockResolvedValue({ user: USER });
  getAthleteByUserId.mockResolvedValue(ATHLETE);
}

describe('answerOnboardingAction', () => {
  it('persists a name-free greeting while returning a personalised one', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'done' });

    const result = await answerOnboardingAction({
      step: 'race',
      raceTarget: 'Ironman Copenhagen',
    });

    expect(result.ok).toBe(true);
    // What is stored: the greeting handed to the service must not contain the
    // athlete's name. This is the assertion that would fail if someone "fixed"
    // the duplication by passing the personalised greeting through.
    const storedGreeting = answerOnboardingStep.mock.calls[0][3] as string;
    expect(storedGreeting).not.toContain('Mads');
    expect(storedGreeting).toContain('Ironman Copenhagen');
  });

  it('greets by first name only, not the full name', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'done' });

    const result = await answerOnboardingAction({
      step: 'race',
      raceTarget: 'Ironman Copenhagen',
    }) as { displayGreetingIntro?: string };

    expect(result.displayGreetingIntro).toContain('Mads');
    expect(result.displayGreetingIntro).not.toContain('Kilstrup');
  });

  it('writes the language preference only after the step is accepted', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'experience' });

    await answerOnboardingAction({ step: 'language', language: 'da' });

    expect(setUiLanguage).toHaveBeenCalledWith(USER.id, 'da');
  });

  it('leaves no language preference behind when the step is rejected', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: false, reason: 'invalid' });

    const result = await answerOnboardingAction({ step: 'language', language: 'klingon' });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(setUiLanguage).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request before reading any athlete', async () => {
    getSession.mockResolvedValue(null);

    const result = await answerOnboardingAction({ step: 'language', language: 'da' });

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(getAthleteByUserId).not.toHaveBeenCalled();
    expect(answerOnboardingStep).not.toHaveBeenCalled();
  });

  it('refuses a signed-in user with no athlete row', async () => {
    getSession.mockResolvedValue({ user: USER });
    getAthleteByUserId.mockResolvedValue(undefined);

    const result = await answerOnboardingAction({ step: 'language', language: 'da' });

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(answerOnboardingStep).not.toHaveBeenCalled();
  });
});
