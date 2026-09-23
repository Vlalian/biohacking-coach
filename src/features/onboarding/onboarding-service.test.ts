import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Athlete } from '@/features/athlete/athlete';

const {
  createRace,
  replacePastRaces,
  ensureBlockFilled,
  mergeAthleteProfile,
  completeAthleteOnboarding,
  appendMessages,
  createConversation,
  endConversation,
  getLatestOpenConversation,
  getMessages,
} = vi.hoisted(() => ({
  mergeAthleteProfile: vi.fn(async () => ({})),
  completeAthleteOnboarding: vi.fn(async () => undefined),
  appendMessages: vi.fn(async () => []),
  createConversation: vi.fn(async () => ({
    id: 'conv_1',
    athleteId: 'athlete_1',
    kind: 'onboarding',
    weeklySessionNumber: null,
    createdAt: new Date(),
    endedAt: null,
  })),
  endConversation: vi.fn(async () => true),
  getLatestOpenConversation: vi.fn(async () => null),
  getMessages: vi.fn(async () => []),
  createRace: vi.fn(async () => undefined),
  replacePastRaces: vi.fn(async () => undefined),
  ensureBlockFilled: vi.fn(async () => 'filled'),
}));

vi.mock('@/features/athlete/athlete-repository', () => ({
  mergeAthleteProfile,
  completeAthleteOnboarding,
}));
vi.mock('@/features/race/race-repository', () => ({ createRace, replacePastRaces }));
vi.mock('@/features/coach/block-fill-service', () => ({ ensureBlockFilled }));
vi.mock('@/features/coach/conversation-repository', () => ({
  appendMessages,
  createConversation,
  endConversation,
  getLatestOpenConversation,
  getMessages,
}));

const { answerOnboardingStep, getOnboardingState } = await import(
  './onboarding-service'
);

const TODAY = '2026-09-21';
const HALF = { distance: 'Half' as const, date: '2025-08-16', finishSeconds: 18720, note: null };

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 'athlete_1',
    syntheticLabel: null,
    experienceLevel: null,
    communicationStyle: null,
    raceTarget: null,
    raceDistance: null,
    hoursPerWeek: null,
    trainingSessionsPerWeek: null,
    profile: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('answerOnboardingStep', () => {
  it('refuses an invalid payload and stores nothing', async () => {
    const result = await answerOnboardingStep(
      athlete(),
      { step: 'language', language: 'fr' },
      { question: 'q', answer: 'a' },
      'greeting',
      TODAY,
    );
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it('persists a mid-flow answer and the conversation exchange', async () => {
    const result = await answerOnboardingStep(
      athlete(),
      { step: 'language', language: 'da' },
      { question: 'Which language?', answer: 'Dansk' },
      'greeting',
      TODAY,
    );

    expect(result.ok).toBe(true);
    // The name step follows the language (preferred-name/02).
    if (result.ok) expect(result.step).toBe('name');
    // The transcript records the exchange under kind=onboarding.
    expect(createConversation).toHaveBeenCalledWith({
      athleteId: 'athlete_1',
      kind: 'onboarding',
    });
    expect(appendMessages).toHaveBeenCalledWith('athlete_1', 'conv_1', [
      { role: 'coach_ai', content: 'Which language?' },
      { role: 'athlete', content: 'Dansk' },
    ]);
    // The answers merged, but no completion columns yet.
    expect(mergeAthleteProfile).toHaveBeenCalledWith('athlete_1', {
      onboardingAnswers: { language: 'da' },
      onboardingSubmitted: {},
    });
    expect(completeAthleteOnboarding).not.toHaveBeenCalled();
    expect(endConversation).not.toHaveBeenCalled();
  });

  it('completes the profile when the last step lands', async () => {
    const nearlyDone = athlete({
      profile: {
        onboardingAnswers: {
          language: 'da',
          pastRaces: [HALF],
          experienceLevel: 'intermediate',
          raceDistance: 'Full',
          hoursPerWeek: 8,
          raceTarget: 'Ironman Copenhagen',
          raceDate: '2026-08-30',
          hasHumanCoach: 'Yes',
        },
        onboardingSubmitted: { name: true, adaptive: true },
      },
    });

    const result = await answerOnboardingStep(
      nearlyDone,
      { step: 'constraints', fixedConstraints: ['Sunday'], weeklySessionDay: 'Monday' },
      { question: 'Any days you can never train?', answer: 'Sunday · Monday' },
      // Name-free by contract: messages is a training-side table (ADR 0006);
      // the action persists coachGreeting('', race), never the personalized one.
      "I'm your Coach. Ironman Copenhagen is your target. Let's get to work.",
      TODAY,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.step).toBe('done');

    // Columns and JSONB land in ONE call: a split write could mark the answers
    // complete while experienceLevel — the page's gate — stayed null.
    expect(completeAthleteOnboarding).toHaveBeenCalledWith(
      'athlete_1',
      {
        experienceLevel: 'intermediate',
        hoursPerWeek: 8,
        pastRaces: [HALF],
        communicationStyle: expect.stringContaining('The athlete'),
        raceDistance: 'Full',
        raceTarget: 'Ironman Copenhagen',
        race: { name: 'Ironman Copenhagen', date: '2026-08-30', distance: 'Full' },
      },
      expect.objectContaining({
        onboarding: expect.objectContaining({ hasHumanCoach: 'Yes' }),
        fixedConstraints: ['Sunday'],
        weeklySessionDay: 'Monday',
      }),
    );
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
    // The listed past races replace whatever was stored (training-architecture/35).
    expect(replacePastRaces).toHaveBeenCalledWith('athlete_1', [HALF]);
    // The calendar is full the first time the athlete opens it: the block is
    // filled once the Target Race exists (`training-architecture/34`).
    expect(ensureBlockFilled).toHaveBeenCalledWith('athlete_1', TODAY);
    expect(ensureBlockFilled.mock.invocationCallOrder[0]).toBeGreaterThan(createRace.mock.invocationCallOrder[0]);
    // The past races land before the athlete is marked onboarded: the stored
    // `experienceLevel` is derived from that list's length, so the other order
    // could put an athlete past the gate with a level their empty race list
    // does not support (CodeRabbit, PR #98).
    expect(replacePastRaces.mock.invocationCallOrder[0]).toBeLessThan(
      completeAthleteOnboarding.mock.invocationCallOrder[0],
    );
    // The Coach's greeting closes the transcript and the conversation ends.
    expect(appendMessages).toHaveBeenLastCalledWith('athlete_1', 'conv_1', [
      { role: 'coach_ai', content: expect.stringContaining("I'm your Coach") },
    ]);
    expect(endConversation).toHaveBeenCalled();
    // The Race is a record of its own from the first one, and the first one is
    // the Target Race — the athlete has exactly one horizon to plan toward.
    expect(createRace).toHaveBeenCalledWith(
      'athlete_1',
      { name: 'Ironman Copenhagen', date: '2026-08-30', distance: 'Full' },
      { asTarget: true },
    );
  });

  it('completes an athlete who has no race, and creates none', async () => {
    const nearlyDone = athlete({
      profile: {
        onboardingAnswers: {
          language: 'en',
          pastRaces: [],
          experienceLevel: 'beginner',
          raceDistance: 'Olympic',
          hoursPerWeek: 4,
          noRaceYet: true,
        },
        onboardingSubmitted: { name: true, adaptive: true },
      },
    });

    const result = await answerOnboardingStep(
      nearlyDone,
      { step: 'constraints' },
      { question: 'Any days you can never train?', answer: '—' },
      "I'm your Coach. Let's get to work.",
      TODAY,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.step).toBe('done');
    // Onboarding finishes. The distance still lands — it is what shapes the
    // week — and the horizon is simply empty.
    expect(completeAthleteOnboarding).toHaveBeenCalledWith(
      'athlete_1',
      expect.objectContaining({ raceDistance: 'Olympic', race: null }),
      expect.anything(),
    );
    expect(createRace).not.toHaveBeenCalled();
    expect(replacePastRaces).toHaveBeenCalledWith('athlete_1', []);
    // No race, no blocks — the fill is still asked and answers 'no-race'.
    expect(ensureBlockFilled).toHaveBeenCalledWith('athlete_1', TODAY);
  });
});

describe('getOnboardingState — resumption', () => {
  it('resumes at the first unanswered step with the stored answers', async () => {
    const midway = athlete({
      profile: {
        onboardingAnswers: { language: 'en', pastRaces: [HALF, HALF, HALF, HALF], experienceLevel: 'veteran' },
        onboardingSubmitted: { name: true },
      },
    });
    const state = await getOnboardingState(midway);
    expect(state.step).toBe('distance');
    expect(state.answers.experienceLevel).toBe('veteran');
  });
});
