import { describe, it, expect, vi, beforeEach } from 'vitest';
import en from '@/messages/en.json';
import da from '@/messages/da.json';

const {
  getSession,
  getAthleteByUserId,
  answerOnboardingStep,
  setUiLanguage,
  setPreferredName,
  getUiPrefs,
  getTranslations,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAthleteByUserId: vi.fn(),
  answerOnboardingStep: vi.fn(),
  setUiLanguage: vi.fn(),
  setPreferredName: vi.fn(),
  getUiPrefs: vi.fn(async () => ({})),
  getTranslations: vi.fn(async () => translatorFor(en)),
}));

/**
 * A translator over one catalogue's Onboarding block: the greeting keys resolve
 * to their sentence with `{x}` substituted; anything else echoes its key, so
 * the transcript-question assertions keep reading keys.
 */
function translatorFor(cat: { Onboarding: Record<string, string> }) {
  return (key: string, values: Record<string, string> = {}) =>
    key.startsWith('greeting')
      ? cat.Onboarding[key].replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')
      : key;
}

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({ getTranslations }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/onboarding/onboarding-service', () => ({ answerOnboardingStep }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ setUiLanguage, setPreferredName, getUiPrefs }));

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
  setPreferredName.mockReset();
  getUiPrefs.mockReset().mockResolvedValue({});
  getTranslations.mockClear();
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
      raceDate: '2027-08-15',
    });

    expect(result.ok).toBe(true);
    // What is stored: the greeting handed to the service must not contain the
    // athlete's name. This is the assertion that would fail if someone "fixed"
    // the duplication by passing the personalised greeting through.
    const storedGreeting = answerOnboardingStep.mock.calls[0][3] as string;
    expect(storedGreeting).not.toContain('Mads');
    expect(storedGreeting).toBe("I'm Momentum. Ironman Copenhagen is your target. Let's get to work.");
    // The seam reads the request's own session, in the Onboarding namespace.
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
    expect(getTranslations).toHaveBeenCalledWith('Onboarding');
    // A race step never touches the user-side preferences.
    expect(setUiLanguage).not.toHaveBeenCalled();
    expect(setPreferredName).not.toHaveBeenCalled();
  });

  it('names the stored race in the greeting when the finishing step is not the race step', async () => {
    getSession.mockResolvedValue({ user: USER });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      profile: { onboardingAnswers: { raceTarget: 'Ironman Kalmar' } },
    });
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'done' });

    const result = (await answerOnboardingAction({ step: 'constraints' })) as {
      displayGreetingBody?: string;
    };

    expect(answerOnboardingStep.mock.calls[0][3]).toBe(
      "I'm Momentum. Ironman Kalmar is your target. Let's get to work.",
    );
    expect(result.displayGreetingBody).toBe("Ironman Kalmar is your target. Let's get to work.");
  });

  it('greets without a race for "no race yet", and for an athlete with no profile at all', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'done' });
    const noRace = (await answerOnboardingAction({ step: 'race', noRaceYet: true })) as {
      displayGreetingBody?: string;
    };
    expect(noRace.displayGreetingBody).toBe("Let's get to work.");

    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', profile: null });
    const noProfile = (await answerOnboardingAction({ step: 'constraints' })) as {
      displayGreetingBody?: string;
    };
    expect(noProfile.displayGreetingBody).toBe("Let's get to work.");

    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', profile: {} });
    const noAnswers = (await answerOnboardingAction({ step: 'constraints' })) as {
      displayGreetingBody?: string;
    };
    expect(noAnswers.displayGreetingBody).toBe("Let's get to work.");
  });

  it('treats a forged race payload that says both "no race" and a name as no race', async () => {
    // The decision wins, as it does in the flow (`noRaceYet === true` stores
    // nothing else); the greeting must not name a race the record will not hold.
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'done' });
    const result = (await answerOnboardingAction({
      step: 'race',
      noRaceYet: true,
      raceTarget: 'Forged',
    } as unknown as Parameters<typeof answerOnboardingAction>[0])) as { displayGreetingBody?: string };
    expect(result.displayGreetingBody).toBe("Let's get to work.");
  });

  it('adds no display greeting, and reads no prefs, before the last step', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'pastRaces' });

    const result = await answerOnboardingAction({ step: 'name', preferredName: 'Mads' });

    expect(result).toEqual({ ok: true, step: 'pastRaces' });
    expect(getUiPrefs).not.toHaveBeenCalled();
  });

  it.each([
    ['language', { step: 'language', language: 'da' }, 'qLanguage', 'Dansk'],
    ['name', { step: 'name', preferredName: 'Mads' }, 'qName', 'Chosen'],
    ['pastRaces', { step: 'pastRaces', pastRaces: [{ distance: 'Half', date: '2025-08-16' }] }, 'qPastRaces', 'Half 2025-08-16'],
    ['distance', { step: 'distance', raceDistance: 'Full' }, 'qDistance', 'Full'],
    ['hours', { step: 'hours', hoursPerWeek: 8 }, 'qHours', '8 h/week'],
    ['race', { step: 'race', noRaceYet: true }, 'qRace', 'No race booked yet'],
    ['adaptive', { step: 'adaptive' }, 'qAdaptive', '—'],
    ['constraints', { step: 'constraints' }, 'qConstraints', '— · Sunday'],
  ] as const)(
    'records the %s step in the transcript as the Coach asked it and the athlete answered it',
    async (_step, payload, questionKey, answer) => {
      signedIn();
      answerOnboardingStep.mockResolvedValue({ ok: true, step: 'pastRaces' });

      await answerOnboardingAction(payload as Parameters<typeof answerOnboardingAction>[0]);

      expect(answerOnboardingStep.mock.calls[0][2]).toEqual({ question: questionKey, answer });
    },
  );

  // preferred-name/02: the greeting uses the name the athlete chose for the
  // Coach — and nothing derived from `user.name`. The first-name split that
  // used to live here (`user.name.trim().split(/\s+/)[0]`) is gone: it took
  // the surname for anyone whose family name is written first.
  it('greets by the Preferred Name, read from the user seam, never by the account name', async () => {
    signedIn();
    getUiPrefs.mockResolvedValue({ preferredName: 'Captain' });
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'done' });

    const result = await answerOnboardingAction({
      step: 'race',
      raceTarget: 'Ironman Copenhagen',
      raceDate: '2027-08-15',
    }) as { displayGreetingIntro?: string };

    expect(result.displayGreetingIntro).toContain('Captain');
    expect(result.displayGreetingIntro).not.toContain('Mads');
    expect(result.displayGreetingIntro).not.toContain('Kilstrup');
  });

  it('stores and shows the greeting in the request’s language — Danish when the catalogue is Danish', async () => {
    signedIn();
    getUiPrefs.mockResolvedValueOnce({ preferredName: 'Captain' });
    getTranslations.mockResolvedValueOnce(translatorFor(da));
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'done' });

    const result = await answerOnboardingAction({
      step: 'race',
      raceTarget: 'Ironman Copenhagen',
      raceDate: '2027-08-15',
    });

    expect(answerOnboardingStep.mock.calls[0][3]).toBe(
      'Jeg er Momentum. Ironman Copenhagen er dit mål. Lad os komme i gang.',
    );
    expect(result).toMatchObject({
      displayGreetingIntro: 'Hej Captain. Jeg er Momentum.',
      displayGreetingBody: 'Ironman Copenhagen er dit mål. Lad os komme i gang.',
    });
  });

  it('greets without any name when the athlete chose none — user.name is not a fallback', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'done' });

    const result = await answerOnboardingAction({
      step: 'race',
      raceTarget: 'Ironman Copenhagen',
      raceDate: '2027-08-15',
    }) as { displayGreetingIntro?: string };

    expect(result.displayGreetingIntro).toBe("I'm Momentum.");
  });

  it('stores the Preferred Name on the user, identity-side, only after the step is accepted', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'pastRaces' });

    await answerOnboardingAction({ step: 'name', preferredName: '  Mads ' });

    expect(setPreferredName).toHaveBeenCalledWith(USER.id, 'Mads');
    // The payload reaches the flow (it validates the value), but what the flow
    // persists does not: the transcript line and the greeting carry no name,
    // and `applyAnswer` is pinned elsewhere to store nothing from it.
    expect(JSON.stringify(answerOnboardingStep.mock.calls[0].slice(2))).not.toContain('Mads');
  });

  it('clears the Preferred Name when the step is skipped', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'pastRaces' });

    await answerOnboardingAction({ step: 'name' });

    expect(setPreferredName).toHaveBeenCalledWith(USER.id, null);
  });

  it('leaves no Preferred Name behind when the step is rejected', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: false, reason: 'invalid' });

    await answerOnboardingAction({ step: 'name', preferredName: 'mads@example.com' });

    expect(setPreferredName).not.toHaveBeenCalled();
  });

  it('writes the language preference only after the step is accepted', async () => {
    signedIn();
    answerOnboardingStep.mockResolvedValue({ ok: true, step: 'pastRaces' });

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

