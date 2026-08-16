import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Athlete } from '@/features/athlete/athlete';

const {
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
}));

vi.mock('@/features/athlete/athlete-repository', () => ({
  mergeAthleteProfile,
  completeAthleteOnboarding,
}));
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

const TODAY = new Date(2026, 6, 24);

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 'athlete_1',
    syntheticLabel: null,
    trainingPhase: null,
    experienceLevel: null,
    communicationStyle: null,
    raceTarget: null,
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
    if (result.ok) expect(result.step).toBe('experience');
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
          experienceLevel: 'intermediate',
          raceTarget: 'Ironman Copenhagen, August 2026',
          hasHumanCoach: 'Yes',
        },
        onboardingSubmitted: { adaptive: true },
      },
    });

    const result = await answerOnboardingStep(
      nearlyDone,
      { step: 'constraints', fixedConstraints: ['Sunday'], weeklySessionDay: 'Monday' },
      { question: 'Any days you can never train?', answer: 'Sunday · Monday' },
      // Name-free by contract: messages is a training-side table (ADR 0006);
      // the action persists coachGreeting('', race), never the personalized one.
      "I'm your Coach. Ironman Copenhagen, August 2026 is your target. Let's get to work.",
      TODAY,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.step).toBe('done');

    // Columns and JSONB land in ONE call: a split write could mark the answers
    // complete while experienceLevel — the page's gate — stayed null.
    expect(completeAthleteOnboarding).toHaveBeenCalledWith(
      'athlete_1',
      {
        trainingPhase: 'Taper',
        experienceLevel: 'intermediate',
        communicationStyle: expect.stringContaining('The athlete'),
        raceTarget: 'Ironman Copenhagen, August 2026',
      },
      expect.objectContaining({
        onboarding: expect.objectContaining({ hasHumanCoach: 'Yes' }),
        fixedConstraints: ['Sunday'],
        weeklySessionDay: 'Monday',
      }),
    );
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
    // The Coach's greeting closes the transcript and the conversation ends.
    expect(appendMessages).toHaveBeenLastCalledWith('athlete_1', 'conv_1', [
      { role: 'coach_ai', content: expect.stringContaining("I'm your Coach") },
    ]);
    expect(endConversation).toHaveBeenCalled();
  });
});

describe('getOnboardingState — resumption', () => {
  it('resumes at the first unanswered step with the stored answers', async () => {
    const midway = athlete({
      profile: {
        onboardingAnswers: { language: 'en', experienceLevel: 'veteran' },
        onboardingSubmitted: {},
      },
    });
    const state = await getOnboardingState(midway);
    expect(state.step).toBe('race');
    expect(state.answers.experienceLevel).toBe('veteran');
  });
});
