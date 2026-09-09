import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_OPTIONS,
  ONBOARDING_STEPS,
  RACE_DISTANCES,
  OPTION_MESSAGE_KEY,
  applyAnswer,
  buildCommStyle,
  coachGreeting,
  completeProfile,
  computePhase,
  nextStep,
  toCoachOnboarding,
} from './onboarding-flow';
import en from '@/messages/en.json';
import da from '@/messages/da.json';

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

describe('the questionnaire shape', () => {
  it('asks its questions in a fixed order, distance before the race', () => {
    // The order is the contract the progress rail and the resume point both
    // read. Distance sits before the race because it is asked of everyone,
    // including the athlete who has no race to describe.
    expect(ONBOARDING_STEPS).toEqual([
      'language',
      'experience',
      'distance',
      'race',
      'adaptive',
      'constraints',
    ]);
  });
});

describe('nextStep', () => {
  it('walks the steps in order as answers arrive', () => {
    expect(nextStep({})).toBe('language');
    expect(nextStep({ language: 'da' })).toBe('experience');
    expect(nextStep({ language: 'da', experienceLevel: 'beginner' })).toBe('distance');
    expect(
      nextStep({ language: 'da', experienceLevel: 'beginner', raceDistance: 'Full' }),
    ).toBe('race');
    expect(
      nextStep({
        language: 'da',
        experienceLevel: 'beginner',
        raceDistance: 'Full',
        raceTarget: 'IM CPH',
        raceDate: '2027-08-15',
      }),
    ).toBe('adaptive');
  });

  it('treats an empty adaptive submission as answered (all its fields are optional)', () => {
    const answers = {
      language: 'da',
      experienceLevel: 'beginner' as const,
      raceDistance: 'Full' as const,
      raceTarget: 'IM CPH',
      raceDate: '2027-08-15',
    };
    expect(nextStep(answers, { adaptive: true })).toBe('constraints');
    expect(nextStep(answers, { adaptive: true, constraints: true })).toBe('done');
  });

  it('is the resume point: an interrupted flow restarts at the first unanswered step', () => {
    // The athlete answered language + experience, refreshed mid-distance-question.
    expect(nextStep({ language: 'en', experienceLevel: 'veteran' })).toBe('distance');
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

  // Regression (CodeRabbit, PR #38): these optional fields were guarded by a
  // truthy check, so a *present but malformed* value — null, '', 0, false —
  // skipped `inSet` entirely and was written into the stored profile despite the
  // declared string type. Only `undefined` means "left unanswered".
  it.each([
    ['availableHours', null],
    ['availableHours', ''],
    ['availableHours', 0],
    ['motivation', null],
    ['motivation', false],
    ['hasHumanCoach', ''],
  ])('refuses a present-but-malformed %s (%p)', (field, value) => {
    expect(
      applyAnswer({}, {}, { step: 'adaptive', [field]: value } as never),
    ).toBeNull();
  });

  // The same hole, on a different step, missed by the fix above — which claimed
  // in its commit message that the three adaptive fields "were the outliers, not
  // the rule". They were not: there were four. Found by review, 2026-08-21.
  //
  // This one is the most consequential of them: `weeklySessionDay` is a named
  // domain concept (CONTEXT.md, Weekly Session Day) that decides when the Coach
  // opens the Weekly Session, so a malformed value stored here misroutes the
  // product's primary ritual rather than just a prompt line.
  it.each([
    ['weeklySessionDay', null],
    ['weeklySessionDay', ''],
    ['weeklySessionDay', 0],
    ['weeklySessionDay', false],
  ])('refuses a present-but-malformed %s (%p)', (field, value) => {
    expect(
      applyAnswer({}, {}, { step: 'constraints', [field]: value } as never),
    ).toBeNull();
  });

  it('still treats an omitted weeklySessionDay as legitimate', () => {
    expect(applyAnswer({}, {}, { step: 'constraints' })).not.toBeNull();
  });

  it('still treats an omitted optional answer as legitimate', () => {
    // The other half of the same rule: an empty adaptive submission is a valid
    // answer (every question there is optional), so it must not be refused.
    expect(applyAnswer({}, {}, { step: 'adaptive' })).not.toBeNull();
  });

  it('refuses empty or oversized free text', () => {
    const date = '2027-08-15';
    expect(applyAnswer({}, {}, { step: 'race', raceTarget: '   ', raceDate: date })).toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'race', raceTarget: 'x'.repeat(300), raceDate: date }),
    ).toBeNull();
    // The cap itself, on both sides: a name of exactly the limit is a legal
    // name, and only the one after it is not.
    expect(
      applyAnswer({}, {}, { step: 'race', raceTarget: 'x'.repeat(200), raceDate: date }),
    ).not.toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'race', raceTarget: 'x'.repeat(201), raceDate: date }),
    ).toBeNull();
  });

  it('refuses a malformed payload rather than throwing', () => {
    // A server action's payload is untrusted: the declared types are erased at
    // runtime, so a hand-rolled request can omit fields or send wrong types.
    // Each of these must return null, never throw.
    const bad = [
      { step: 'race' },
      { step: 'race', raceTarget: 42 },
      { step: 'language' },
      { step: 'experience', experienceLevel: null },
      { step: 'adaptive', sportBackground: 'Runner' }, // string, not array
      { step: 'adaptive', bestTime: 99 },
      { step: 'constraints', fixedConstraints: 'Monday' },
    ];
    for (const payload of bad) {
      expect(() =>
        applyAnswer({}, {}, payload as unknown as Parameters<typeof applyAnswer>[2]),
      ).not.toThrow();
      expect(
        applyAnswer({}, {}, payload as unknown as Parameters<typeof applyAnswer>[2]),
      ).toBeNull();
    }
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

// ── Race Distance and the Race — training-architecture/02 ────────────────────

describe('Race Distance is asked of every athlete, from a closed set', () => {
  it('accepts each of the four distances', () => {
    for (const distance of RACE_DISTANCES) {
      expect(
        applyAnswer({}, {}, { step: 'distance', raceDistance: distance })?.answers
          .raceDistance,
      ).toBe(distance);
    }
  });

  it('refuses anything outside the set', () => {
    // Closed rather than free text because §04's rules are per-distance bands —
    // session frequency, when race-pace language becomes meaningful, how late
    // bricks can wait — and a band cannot be looked up from prose. "Other"
    // (duathlon, aquabike, a marathon used as a build race) is deliberately
    // deferred to post-test rather than smuggled in as free text.
    for (const bad of ['Ironman', 'other', '', 70.3, null, undefined]) {
      expect(
        applyAnswer({}, {}, {
          step: 'distance',
          raceDistance: bad,
        } as unknown as Parameters<typeof applyAnswer>[2]),
      ).toBeNull();
    }
  });

  it('is asked before the race itself, and of an athlete who has no race', () => {
    // Deliberately not a property of the race: an athlete building toward an
    // Ironman with nothing booked still needs an Ironman-shaped week — the
    // winter-base athlete of *Distancens Arkitektur* §14.
    expect(nextStep({ language: 'en', experienceLevel: 'veteran' })).toBe('distance');
    expect(
      nextStep({ language: 'en', experienceLevel: 'veteran', raceDistance: 'Full' }),
    ).toBe('race');
  });
});

describe('a Race is optional, and saying so is an answer', () => {
  it('takes a name and a date', () => {
    const after = applyAnswer({}, {}, {
      step: 'race',
      raceTarget: 'Ironman Copenhagen',
      raceDate: '2027-08-15',
    });
    expect(after?.answers.raceTarget).toBe('Ironman Copenhagen');
    expect(after?.answers.raceDate).toBe('2027-08-15');
    expect(after?.answers.noRaceYet).toBeUndefined();
  });

  it('records "I do not have one yet" as a decision, not an absence', () => {
    // The distinction the acceptance criterion turns on: an athlete who said
    // they have no race is not the same as one who was never asked, and only
    // the first should be allowed past this step.
    const after = applyAnswer({}, {}, { step: 'race', noRaceYet: true });
    expect(after?.answers.noRaceYet).toBe(true);
    expect(after?.answers.raceTarget).toBeUndefined();
    expect(after?.answers.raceDate).toBeUndefined();

    const unasked = {};
    expect(nextStep({ language: 'en', experienceLevel: 'veteran', raceDistance: 'Half' }))
      .toBe('race');
    expect(
      nextStep({
        language: 'en',
        experienceLevel: 'veteran',
        raceDistance: 'Half',
        ...after?.answers,
        ...unasked,
      }),
    ).toBe('adaptive');
  });

  it('refuses a race without a date, and a date that is not one', () => {
    // A name with no date is what the old free-text field allowed, and it is
    // what the four regexes then guessed at. There is no guessing now, so the
    // date has to be given.
    expect(applyAnswer({}, {}, { step: 'race', raceTarget: 'Ironman Copenhagen' } as unknown as Parameters<typeof applyAnswer>[2])).toBeNull();
    for (const bad of ['2027-02-30', 'August 2027', '15/08/2027', '2027', '']) {
      expect(
        applyAnswer({}, {}, {
          step: 'race',
          raceTarget: 'Ironman Copenhagen',
          raceDate: bad,
        } as unknown as Parameters<typeof applyAnswer>[2]),
      ).toBeNull();
    }
  });
});

// ── computePhase — a real race date, never a guess at one ────────────────────

/**
 * `training-architecture/02`. This used to take the athlete's free-text race
 * name and run four heuristics over it — an ISO date, "Month YYYY" against a
 * month-name table, `dd/mm/yyyy`, and a bare four-digit year *assumed to be
 * mid-June* — falling silently through to `Base Building` when none matched.
 *
 * An athlete who typed a race with no year has had a wrong Training Phase since
 * onboarding, with nothing anywhere to show why. The bands below are unchanged;
 * what changed is that the date is now a field the athlete gave rather than
 * something parsed out of prose.
 */
describe('computePhase', () => {
  const TODAY = new Date(2026, 6, 24); // 2026-07-24

  it('maps months-to-race onto phases', () => {
    expect(computePhase(new Date(2026, 7, 30), TODAY)).toBe('Taper'); // ~1.2 months
    expect(computePhase(new Date(2026, 9, 24), TODAY)).toBe('Peak Phase'); // ~3 months
    expect(computePhase(new Date(2026, 11, 20), TODAY)).toBe('Build Phase'); // ~5 months
    expect(computePhase(new Date(2027, 5, 15), TODAY)).toBe('Base Building'); // ~11 months
    expect(computePhase(new Date(2026, 0, 1), TODAY)).toBe('Recovery'); // past
  });

  it('puts each band boundary on the later side', () => {
    // `months < 2` and not `<=`: an athlete exactly two months out is in Peak
    // Phase, not Taper. The bands are computed against a 30.5-day month, so
    // these are constructed from that arithmetic rather than from calendar
    // dates — nothing else lands exactly on a boundary, and a boundary that is
    // never tested is a boundary that can move without anyone noticing.
    const MONTH_MS = 1000 * 60 * 60 * 24 * 30.5;
    const EPOCH = new Date(0);
    const out = (months: number) => computePhase(new Date(months * MONTH_MS), EPOCH);

    expect(out(0)).toBe('Taper'); // exactly today is not yet Recovery
    expect(out(2)).toBe('Peak Phase');
    expect(out(4)).toBe('Build Phase');
    expect(out(6)).toBe('Base Building');
  });

  it('is Base Building for a date that is not one', () => {
    // The guard exists because `new Date(...)` returns an Invalid Date rather
    // than throwing, and arithmetic on it yields NaN — which compares false
    // against every band and would fall out of the function as Base Building
    // by accident rather than by decision.
    expect(computePhase(new Date('not-a-date'), new Date(2026, 6, 24))).toBe('Base Building');
  });

  it('is Base Building when the athlete has no race date', () => {
    // The same answer the old fallback gave, but now because there is genuinely
    // no horizon rather than because a regex missed.
    expect(computePhase(null, TODAY)).toBe('Base Building');
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
        availableHours: '3–6h',
        motivation: 'Completion',
      }),
    ).toEqual({
      sportBackground: ['Runner', 'Gym'],
      availableHours: '3–6h',
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
        raceDistance: 'Full',
        raceTarget: 'Ironman Copenhagen',
        raceDate: '2026-08-30',
        hasHumanCoach: 'Yes',
      },
      TODAY,
    );
    expect(profile).toEqual({
      trainingPhase: 'Taper',
      experienceLevel: 'intermediate',
      communicationStyle: expect.stringContaining('works with a human coach'),
      raceDistance: 'Full',
      raceTarget: 'Ironman Copenhagen',
      race: { name: 'Ironman Copenhagen', date: '2026-08-30', distance: 'Full' },
    });
    // The columns carry no name (ADR 0006 — training tables never carry one).
    expect(JSON.stringify(profile)).not.toContain('Mads');
  });

  it('completes for an athlete with no race, and gives them no Race', () => {
    // "Ready to start the next block" is as valid a goal as a start line. The
    // profile is finished, the horizon is simply empty — and the phase says so
    // rather than being guessed at.
    const profile = completeProfile(
      {
        language: 'en',
        experienceLevel: 'beginner',
        raceDistance: 'Olympic',
        noRaceYet: true,
      },
      TODAY,
    );
    expect(profile?.race).toBeNull();
    expect(profile?.raceDistance).toBe('Olympic');
    expect(profile?.trainingPhase).toBe('Base Building');
    // Empty, not a stand-in: this column reaches the Coach's session-1 arc and
    // the onboarding greeting, both of which read "no race" from emptiness.
    expect(profile?.raceTarget).toBe('');
  });

  it('needs a date beside the name before it counts as a race', () => {
    // A name with no date is not half a race, it is no race — and an athlete
    // in that state has not answered the question either way, so completion is
    // refused rather than a race being invented from the name alone.
    expect(
      completeProfile(
        {
          experienceLevel: 'beginner',
          raceDistance: 'Half',
          raceTarget: 'Ironman Copenhagen',
          noRaceYet: true,
        },
        TODAY,
      )?.race,
    ).toBeNull();
    expect(
      completeProfile(
        { experienceLevel: 'beginner', raceDistance: 'Half', raceTarget: 'Ironman Copenhagen' },
        TODAY,
      ),
    ).toBeNull();
  });

  it('refuses to complete while the race question is simply unanswered', () => {
    // Distance answered, race neither given nor declined: the flow has not
    // reached its end, and a profile written now would be missing a decision
    // nobody made.
    expect(
      completeProfile({ experienceLevel: 'beginner', raceDistance: 'Half' }, TODAY),
    ).toBeNull();
  });

  it('refuses to complete without a Race Distance, which everyone answers', () => {
    expect(
      completeProfile(
        { experienceLevel: 'beginner', raceTarget: 'IM CPH', raceDate: '2027-08-15' },
        TODAY,
      ),
    ).toBeNull();
  });

  it('returns null while required answers are missing', () => {
    expect(completeProfile({ language: 'da' }, TODAY)).toBeNull();
    expect(completeProfile({ experienceLevel: 'beginner' }, TODAY)).toBeNull();
  });
});

// ── Option labels — every tile the athlete sees has real words on it ──────────

describe('OPTION_MESSAGE_KEY', () => {
  // Exhaustiveness over the option *values* is a type error, not a test: the
  // map is keyed by a union derived from ONBOARDING_OPTIONS. What a type cannot
  // check is the other end — that the key it points at exists in every locale
  // catalogue. Without that, the athlete is shown "Onboarding.10-13h", which is
  // exactly what shipped to the deployment on 2026-08-21.
  //
  // The existing messages.test.ts cannot catch this: it compares en to da, and
  // a key missing from *both* leaves them in perfect agreement with each other
  // and with nothing else.
  const catalogues = { en, da } as const;
  const keys = Object.values(OPTION_MESSAGE_KEY);

  it('gives every rendered option a message key', () => {
    const labelled = [
      ...ONBOARDING_OPTIONS.sportBackground,
      ...ONBOARDING_OPTIONS.availableHours,
      ...ONBOARDING_OPTIONS.motivation,
      ...ONBOARDING_OPTIONS.weakestDiscipline,
      ...ONBOARDING_OPTIONS.hasHumanCoach,
      ...ONBOARDING_OPTIONS.trackedMetrics,
      ...ONBOARDING_OPTIONS.days,
      ...ONBOARDING_OPTIONS.weeklySessionDay,
    ];
    for (const value of labelled) {
      expect(OPTION_MESSAGE_KEY[value], `no message key for option "${value}"`).toBeTruthy();
    }
  });

  it('points every key at a real message, in every locale', () => {
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      for (const key of keys) {
        expect(
          (catalogue.Onboarding as Record<string, string>)[key],
          `locale "${locale}" has no Onboarding.${key}`,
        ).toBeTruthy();
      }
    }
  });

  it('has dropped the label whose bucket no longer exists', () => {
    // `opt10plus` outlived its bucket when the top of the range was split into
    // 10-13 / 13-16 / 16+. A dead label is harmless on screen and misleading in
    // the catalogue, so it goes. Named rather than swept for: a heuristic over
    // "keys starting with opt" also matches `optional`, which is not an option.
    for (const catalogue of Object.values(catalogues)) {
      expect((catalogue.Onboarding as Record<string, string>).opt10plus).toBeUndefined();
    }
  });
});
