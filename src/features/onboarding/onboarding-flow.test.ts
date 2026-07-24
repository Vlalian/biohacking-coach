import { describe, it, expect } from 'vitest';
import {
  applyAnswer,
  buildCommStyle,
  coachGreeting,
  completeProfile,
  computePhase,
  nextStep,
  toCoachOnboarding,
} from './onboarding-flow';

// ── coachGreeting — the POC's completion contract, carried across ─────────────

describe('coachGreeting — name and race present', () => {
  it('greets by name', () => {
    expect(coachGreeting('Mads', 'Ironman Copenhagen').intro).toBe(
      "Hello Mads. I'm your Coach.",
    );
  });
  it('states race target', () => {
    expect(coachGreeting('Mads', 'Ironman Copenhagen').body).toBe(
      "Ironman Copenhagen is your target. Let's get to work.",
    );
  });
});

describe('coachGreeting — name missing', () => {
  it('uses generic intro', () => {
    expect(coachGreeting('', 'Ironman Copenhagen').intro).toBe("I'm your Coach.");
  });
  it('still states race in body', () => {
    expect(coachGreeting('', 'Ironman Copenhagen').body).toBe(
      "Ironman Copenhagen is your target. Let's get to work.",
    );
  });
});

describe('coachGreeting — race missing', () => {
  it('still greets by name', () => {
    expect(coachGreeting('Mads', '').intro).toBe("Hello Mads. I'm your Coach.");
  });
  it('uses generic body', () => {
    expect(coachGreeting('Mads', '').body).toBe("Let's get to work.");
  });
});

describe('coachGreeting — neither name nor race', () => {
  it('generic intro', () => {
    expect(coachGreeting('', '').intro).toBe("I'm your Coach.");
  });
  it('generic body', () => {
    expect(coachGreeting('', '').body).toBe("Let's get to work.");
  });
});

// ── nextStep — the resume point ───────────────────────────────────────────────

describe('nextStep', () => {
  it('walks the steps in order as answers arrive', () => {
    expect(nextStep({})).toBe('language');
    expect(nextStep({ language: 'da' })).toBe('experience');
    expect(nextStep({ language: 'da', experienceLevel: 'beginner' })).toBe('race');
    expect(
      nextStep({ language: 'da', experienceLevel: 'beginner', raceTarget: 'IM CPH' }),
    ).toBe('adaptive');
  });

  it('treats an empty adaptive submission as answered (all its fields are optional)', () => {
    const answers = {
      language: 'da',
      experienceLevel: 'beginner' as const,
      raceTarget: 'IM CPH',
    };
    expect(nextStep(answers, { adaptive: true })).toBe('constraints');
    expect(nextStep(answers, { adaptive: true, constraints: true })).toBe('done');
  });

  it('is the resume point: an interrupted flow restarts at the first unanswered step', () => {
    // The athlete answered language + experience, refreshed mid-race-question.
    expect(nextStep({ language: 'en', experienceLevel: 'veteran' })).toBe('race');
  });
});

// ── applyAnswer — the validation gate ─────────────────────────────────────────

describe('applyAnswer', () => {
  it('refuses values outside the closed option sets', () => {
    expect(applyAnswer({}, {}, { step: 'language', language: 'fr' })).toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'experience', experienceLevel: 'pro' }),
    ).toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'adaptive', motivation: 'Fame' }),
    ).toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'constraints', fixedConstraints: ['Funday'] }),
    ).toBeNull();
  });

  it('refuses empty or oversized free text', () => {
    expect(applyAnswer({}, {}, { step: 'race', raceTarget: '   ' })).toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'race', raceTarget: 'x'.repeat(300) }),
    ).toBeNull();
  });

  it('changing the language never resets the other answers', () => {
    // The acceptance criterion: choosing Danish switches the language without
    // resetting the profile. Language is one key in the answer record; applying
    // it touches nothing else.
    const before = {
      language: 'en',
      experienceLevel: 'veteran' as const,
      raceTarget: 'IM CPH',
      trackedMetrics: ['Power'],
    };
    const after = applyAnswer(before, { adaptive: true }, { step: 'language', language: 'da' });
    expect(after?.answers).toEqual({ ...before, language: 'da' });
    expect(after?.submitted).toEqual({ adaptive: true });
  });

  it('marks the optional steps submitted even when empty', () => {
    const adaptive = applyAnswer({}, {}, { step: 'adaptive' });
    expect(adaptive?.submitted.adaptive).toBe(true);
    const constraints = applyAnswer({}, {}, { step: 'constraints' });
    expect(constraints?.submitted.constraints).toBe(true);
    expect(constraints?.answers.fixedConstraints).toEqual([]);
  });
});

// ── computePhase — deterministic with an injected clock ──────────────────────

describe('computePhase', () => {
  const TODAY = new Date(2026, 6, 24); // 2026-07-24

  it('maps months-to-race onto phases', () => {
    expect(computePhase('Race 2026-08-30', TODAY)).toBe('Taper'); // ~1.2 months
    expect(computePhase('Race 2026-10-24', TODAY)).toBe('Peak Phase'); // ~3 months
    expect(computePhase('Race 2026-12-20', TODAY)).toBe('Build Phase'); // ~5 months
    expect(computePhase('Ironman June 2027', TODAY)).toBe('Base Building'); // ~11 months
    expect(computePhase('Race 2026-01-01', TODAY)).toBe('Recovery'); // past
  });

  it('reads "Month YYYY", slash dates and bare years', () => {
    expect(computePhase('Ironman Copenhagen, August 2026', TODAY)).toBe('Taper');
    expect(computePhase('30/08/2026', TODAY)).toBe('Taper');
    expect(computePhase('sometime in 2027', TODAY)).toBe('Base Building');
  });

  it('defaults to Base Building when nothing parses', () => {
    expect(computePhase('my local sprint tri', TODAY)).toBe('Base Building');
    expect(computePhase(undefined, TODAY)).toBe('Base Building');
  });
});

// ── buildCommStyle — never the athlete's name ─────────────────────────────────

describe('buildCommStyle', () => {
  it('speaks of "The athlete", never a name (GDPR decision 1)', () => {
    const style = buildCommStyle({
      experienceLevel: 'beginner',
      motivation: 'Performance',
    });
    expect(style).toContain('The athlete');
    expect(style).toContain('performance mindset');
  });

  it('varies by beginner motivation', () => {
    expect(buildCommStyle({ experienceLevel: 'beginner', motivation: 'Community' })).toContain(
      'community experience',
    );
    expect(buildCommStyle({ experienceLevel: 'beginner' })).toContain('first-time Ironman');
  });

  it('notes the human coach for intermediates', () => {
    expect(
      buildCommStyle({ experienceLevel: 'intermediate', hasHumanCoach: 'Yes' }),
    ).toContain('works with a human coach');
    expect(
      buildCommStyle({ experienceLevel: 'intermediate', hasHumanCoach: 'No' }),
    ).not.toContain('human coach');
  });

  it('lists tracked metrics for veterans, ignoring None', () => {
    expect(
      buildCommStyle({ experienceLevel: 'veteran', trackedMetrics: ['Power', 'HRV'] }),
    ).toContain('Tracks Power, HRV.');
    expect(
      buildCommStyle({ experienceLevel: 'veteran', trackedMetrics: ['None'] }),
    ).not.toContain('Tracks');
  });
});

// ── toCoachOnboarding / completeProfile ───────────────────────────────────────

describe('toCoachOnboarding', () => {
  it('maps answers into the prompt shape, nulling what was skipped', () => {
    expect(
      toCoachOnboarding({
        sportBackground: ['Runner', 'Gym'],
        weeklyHours: '3–6h',
        motivation: 'Completion',
      }),
    ).toEqual({
      sportBackground: ['Runner', 'Gym'],
      weeklyHours: '3–6h',
      motivation: 'Completion',
      bestTime: null,
      weakestDiscipline: null,
      hasHumanCoach: null,
      targetTime: null,
      trackedMetrics: null,
    });
  });
});

describe('completeProfile', () => {
  const TODAY = new Date(2026, 6, 24);

  it('assembles the profile columns from a finished answer set', () => {
    const profile = completeProfile(
      {
        language: 'da',
        experienceLevel: 'intermediate',
        raceTarget: 'Ironman Copenhagen, August 2026',
        hasHumanCoach: 'Yes',
      },
      TODAY,
    );
    expect(profile).toEqual({
      trainingPhase: 'Taper',
      experienceLevel: 'intermediate',
      communicationStyle: expect.stringContaining('works with a human coach'),
      raceTarget: 'Ironman Copenhagen, August 2026',
    });
    // The columns carry no name (ADR 0006 — training tables never carry one).
    expect(JSON.stringify(profile)).not.toContain('Mads');
  });

  it('returns null while required answers are missing', () => {
    expect(completeProfile({ language: 'da' }, TODAY)).toBeNull();
    expect(completeProfile({ experienceLevel: 'beginner' }, TODAY)).toBeNull();
  });
});
