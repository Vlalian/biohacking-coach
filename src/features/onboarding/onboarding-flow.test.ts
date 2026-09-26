import { describe, it, expect } from 'vitest';
import {
  ADAPTIVE_FIELDS_BY_LEVEL,
  ONBOARDING_OPTIONS,
  ONBOARDING_STEPS,
  RACE_DISTANCES,
  OPTION_MESSAGE_KEY,
  applyAnswer,
  buildCommStyle,
  coachGreeting,
  completeProfile,
  cursorAfter,
  chosenFirstDay,
  defaultFirstDay,
  firstDayChoiceOf,
  firstDayDate,
  nextStep,
  previousStep,
  stepAfter,
  toCoachOnboarding,
} from './onboarding-flow';
import type { PastRace } from './past-races';
import en from '@/messages/en.json';
import da from '@/messages/da.json';

/** The clock every applyAnswer call gets: a past race may not be dated after today. */
const TODAY = '2026-09-21';
const half = { distance: 'Half' as const, date: '2025-08-16', finishSeconds: 18720, note: null };
const oly = { distance: 'Olympic' as const, date: '2024-06-01', finishSeconds: null, note: 'first one' };

// ── coachGreeting — the POC's completion contract, in the athlete's language ──

/** A translator over one catalogue's Onboarding block, with `{x}` substitution. */
const tFrom =
  (cat: { Onboarding: Record<string, string> }) =>
  (key: string, values: Record<string, string> = {}) =>
    cat.Onboarding[key].replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

describe('coachGreeting — in the athlete’s language', () => {
  const tEn = tFrom(en);
  const tDa = tFrom(da);

  it('names the athlete and the race in English', () => {
    expect(coachGreeting('Mads', 'Ironman Copenhagen', tEn)).toEqual({
      intro: "Hello Mads. I'm Momentum.",
      body: "Ironman Copenhagen is your target. Let's get to work.",
    });
  });

  it('drops the name and the race when absent', () => {
    expect(coachGreeting('', '', tEn)).toEqual({ intro: "I'm Momentum.", body: "Let's get to work." });
    expect(coachGreeting(null, 'Kalmar', tEn)).toEqual({
      intro: "I'm Momentum.",
      body: "Kalmar is your target. Let's get to work.",
    });
    expect(coachGreeting('Mads', '', tEn)).toEqual({
      intro: "Hello Mads. I'm Momentum.",
      body: "Let's get to work.",
    });
  });

  it('speaks Danish when handed the Danish catalogue', () => {
    expect(coachGreeting('Johny', 'Ironman Frankfurt', tDa)).toEqual({
      intro: 'Hej Johny. Jeg er Momentum.',
      body: 'Ironman Frankfurt er dit mål. Lad os komme i gang.',
    });
    expect(coachGreeting('', '', tDa)).toEqual({ intro: 'Jeg er Momentum.', body: 'Lad os komme i gang.' });
  });
});

// ── nextStep — the resume point ───────────────────────────────────────────────

describe('the questionnaire shape', () => {
  it('asks its questions in a fixed order, distance before the race', () => {
    // The order is the contract the progress rail and the resume point both
    // read. Distance sits before the race because it is asked of everyone,
    // including the athlete who has no race to describe.
    // The name step sits right after the language, so it is asked in the
    // athlete's language and is the first thing asked about the relationship
    // rather than about training (preferred-name/02, ruled 2026-08-19).
    expect(ONBOARDING_STEPS).toEqual([
      'language',
      'name',
      'pastRaces',
      'distance',
      'hours',
      'race',
      'adaptive',
      'history',
      'constraints',
      'firstDay',
    ]);
  });
});

describe('nextStep', () => {
  // The name step is answered by submission, like the optional steps: leaving
  // it blank is an answer, so no answer key can mark it done.
  const named = { name: true };

  it('walks the steps in order as answers arrive', () => {
    expect(nextStep({})).toBe('language');
    expect(nextStep({ language: 'da' })).toBe('name');
    expect(nextStep({ language: 'da' }, named)).toBe('pastRaces');
    expect(nextStep({ language: 'da', pastRaces: [], experienceLevel: 'beginner' }, named)).toBe('distance');
    expect(
      nextStep({ language: 'da', pastRaces: [], experienceLevel: 'beginner', raceDistance: 'Full' }, named),
    ).toBe('hours');
    expect(
      nextStep(
        {
          language: 'da',
          pastRaces: [],
          experienceLevel: 'beginner',
          raceDistance: 'Full',
          hoursPerWeek: 8,
          raceTarget: 'IM CPH',
          raceDate: '2027-08-15',
        },
        named,
      ),
    ).toBe('adaptive');
  });

  it('treats an empty adaptive submission as answered (all its fields are optional)', () => {
    const answers = {
      language: 'da',
      pastRaces: [],
      experienceLevel: 'beginner' as const,
      raceDistance: 'Full' as const,
      hoursPerWeek: 8,
      raceTarget: 'IM CPH',
      raceDate: '2027-08-15',
    };
    expect(nextStep(answers, { name: true, adaptive: true })).toBe('history');
    expect(nextStep(answers, { name: true, adaptive: true, history: true })).toBe('constraints');
    expect(nextStep(answers, { name: true, adaptive: true, history: true, constraints: true })).toBe('firstDay');
    expect(
      nextStep({ ...answers, firstDay: 'today' }, { name: true, adaptive: true, history: true, constraints: true }),
    ).toBe('done');
  });

  it('is the resume point: an interrupted flow restarts at the first unanswered step', () => {
    // The athlete answered language + name + experience, refreshed mid-distance-question.
    expect(nextStep({ language: 'en', pastRaces: [half, half, half, half], experienceLevel: 'veteran' }, { name: true })).toBe('distance');
  });
});

// ── the name step — preferred-name/02 ────────────────────────────────────────

describe('applyAnswer — the Preferred Name step', () => {
  it('marks the step submitted and stores NOTHING in the answers — they land in a training table', () => {
    const before = { language: 'en' };
    const result = applyAnswer(before, {}, { step: 'name', preferredName: 'Mads' }, TODAY);
    expect(result?.submitted).toEqual({ name: true });
    expect(result?.answers).toEqual(before);
    expect(JSON.stringify(result)).not.toContain('Mads');
  });

  it('accepts a blank or absent name as an answer — the Coach stays nameless', () => {
    expect(applyAnswer({}, {}, { step: 'name' }, TODAY)?.submitted).toEqual({ name: true });
    expect(applyAnswer({}, {}, { step: 'name', preferredName: '   ' }, TODAY)?.submitted).toEqual({ name: true });
  });

  it('refuses what the write boundary refuses: a non-string, an oversized or an identifier-shaped value', () => {
    expect(applyAnswer({}, {}, { step: 'name', preferredName: 42 as unknown as string }, TODAY)).toBeNull();
    expect(applyAnswer({}, {}, { step: 'name', preferredName: 'a'.repeat(41) }, TODAY)).toBeNull();
    expect(applyAnswer({}, {}, { step: 'name', preferredName: 'mads@example.com' }, TODAY)).toBeNull();
  });

  it('never derives anything from the account name — the flow does not even see it', () => {
    // Nothing in the flow takes a `user.name`; this pins that the step's only
    // input is what the athlete typed. The one-tap prefill an earlier draft
    // proposed was reversed by Mads on 2026-08-21.
    const result = applyAnswer({}, {}, { step: 'name' }, TODAY);
    expect(result?.answers).toEqual({});
  });
});

// ── applyAnswer — the validation gate ─────────────────────────────────────────

describe('previousStep / stepAfter — the way back, and the walk forward again (showable-version/32)', () => {
  it('previousStep walks the sequence back and stops at the first', () => {
    expect(previousStep('language')).toBeNull();
    // The name step sits between language and experience (preferred-name/02).
    expect(previousStep('name')).toBe('language');
    expect(previousStep('pastRaces')).toBe('name');
    expect(previousStep('distance')).toBe('pastRaces');
    expect(previousStep('hours')).toBe('distance');
    expect(previousStep('race')).toBe('hours');
    expect(previousStep('adaptive')).toBe('race');
    expect(previousStep('history')).toBe('adaptive');
    expect(previousStep('constraints')).toBe('history');
  });

  it('stepAfter walks forward in sequence regardless of what is answered, and ends at done', () => {
    expect(stepAfter('language')).toBe('name');
    expect(stepAfter('name')).toBe('pastRaces');
    expect(stepAfter('pastRaces')).toBe('distance');
    expect(stepAfter('distance')).toBe('hours');
    expect(stepAfter('hours')).toBe('race');
    expect(stepAfter('race')).toBe('adaptive');
    expect(stepAfter('adaptive')).toBe('history');
    expect(stepAfter('history')).toBe('constraints');
    expect(stepAfter('constraints')).toBe('firstDay');
    expect(stepAfter('firstDay')).toBe('done');
  });

  it('names the adaptive fields each level asks, so a walk after a level change clears the other level’s answers (review, 2026-09-18)', () => {
    // A beginner answered `motivation`, went Back, became intermediate: the
    // intermediate panel never shows `motivation`, so it must not send it —
    // `applyAnswer('adaptive')` stores every field it is sent.
    expect(ADAPTIVE_FIELDS_BY_LEVEL.beginner).toEqual(['sportBackground', 'motivation']);
    expect(ADAPTIVE_FIELDS_BY_LEVEL.intermediate).toEqual(['bestTime', 'weakestDiscipline', 'hasHumanCoach']);
    expect(ADAPTIVE_FIELDS_BY_LEVEL.veteran).toEqual(['targetTime', 'trackedMetrics']);
  });

  it('cursorAfter: after re-answering an early step the walk continues to the next step in sequence, whatever the server says is first unanswered; done is done', () => {
    // The server answers with the first *unanswered* step, and after Back
    // that is the step the athlete had already reached — not the one after
    // the one they just re-answered. The client owns the cursor.
    expect(cursorAfter('pastRaces', 'constraints')).toBe('distance');
    expect(cursorAfter('race', 'adaptive')).toBe('adaptive');
    expect(cursorAfter('constraints', 'done')).toBe('done');
    expect(cursorAfter('language', 'done')).toBe('done');
  });
});

describe('past races and hours — training-architecture/35', () => {
  // garmin-integration/03 put the history step between adaptive and constraints;
  // training-architecture/36 put the first training day last.
  it('the steps are language, name, pastRaces, distance, hours, race, adaptive, history, constraints, firstDay', () => {
    expect(ONBOARDING_STEPS).toEqual(['language', 'name', 'pastRaces', 'distance', 'hours', 'race', 'adaptive', 'history', 'constraints', 'firstDay']);
  });

  it('pastRaces with two entries stores them and derives intermediate', () => {
    const r = applyAnswer({}, {}, { step: 'pastRaces', pastRaces: [half, oly] }, TODAY);
    expect(r?.answers.pastRaces).toEqual([half, oly]);
    expect(r?.answers.experienceLevel).toBe('intermediate');
  });

  it('pastRaces with none is a valid answer and derives beginner', () => {
    expect(applyAnswer({}, {}, { step: 'pastRaces', pastRaces: [] }, TODAY)?.answers).toEqual({ pastRaces: [], experienceLevel: 'beginner' });
  });

  it('one bad entry refuses the whole answer, and so does a non-array', () => {
    expect(applyAnswer({}, {}, { step: 'pastRaces', pastRaces: [half, { distance: 'Ultra', date: 'x' }] }, TODAY)).toBeNull();
    expect(applyAnswer({}, {}, { step: 'pastRaces', pastRaces: 'none' as never }, TODAY)).toBeNull();
  });

  it('hours accepts an integer 1–50 and refuses 0, 51, 7.5 and a string (the ceiling raised from 30, Mads 2026-09-25)', () => {
    expect(applyAnswer({}, {}, { step: 'hours', hoursPerWeek: 8 }, TODAY)?.answers.hoursPerWeek).toBe(8);
    expect(applyAnswer({}, {}, { step: 'hours', hoursPerWeek: 1 }, TODAY)?.answers.hoursPerWeek).toBe(1);
    expect(applyAnswer({}, {}, { step: 'hours', hoursPerWeek: 50 }, TODAY)?.answers.hoursPerWeek).toBe(50);
    for (const bad of [0, 51, 7.5, '8', null, undefined]) {
      expect(applyAnswer({}, {}, { step: 'hours', hoursPerWeek: bad as never }, TODAY), String(bad)).toBeNull();
    }
  });

  it('nextStep asks pastRaces after name, and hours after distance and before race', () => {
    const named = { name: true };
    expect(nextStep({ language: 'da' }, named)).toBe('pastRaces');
    expect(nextStep({ language: 'da', pastRaces: [], experienceLevel: 'beginner' }, named)).toBe('distance');
    expect(nextStep({ language: 'da', pastRaces: [], experienceLevel: 'beginner', raceDistance: 'Half' }, named)).toBe('hours');
    expect(nextStep({ language: 'da', pastRaces: [], experienceLevel: 'beginner', raceDistance: 'Half', hoursPerWeek: 8 }, named)).toBe('race');
  });

  it('completeProfile returns hoursPerWeek and pastRaces, and is null without hours', () => {
    const full = { language: 'da', pastRaces: [half], experienceLevel: 'intermediate' as const, raceDistance: 'Half' as const, hoursPerWeek: 8, noRaceYet: true as const };
    expect(completeProfile(full)).toMatchObject({ hoursPerWeek: 8, pastRaces: [half], experienceLevel: 'intermediate' });
    expect(completeProfile({ ...full, hoursPerWeek: undefined })).toBeNull();
    // An old answer set with no list: an empty one, not a crash.
    expect(completeProfile({ ...full, pastRaces: undefined })?.pastRaces).toEqual([]);
  });

  it('no option key or answer field mentions availableHours any more', () => {
    expect(Object.keys(OPTION_MESSAGE_KEY).some((k) => /^(Under 3h|3–6h|6–10h|10–13h|13–16h|16h\+)$/.test(k))).toBe(false);
    expect('availableHours' in ONBOARDING_OPTIONS).toBe(false);
    expect(ADAPTIVE_FIELDS_BY_LEVEL.beginner).toEqual(['sportBackground', 'motivation']);
    expect(toCoachOnboarding({ hoursPerWeek: 8 })).toMatchObject({ hoursPerWeek: 8 });
    expect(toCoachOnboarding({})).toMatchObject({ hoursPerWeek: null });
  });

  it('buildCommStyle counts the finished races instead of guessing "2–4 Ironman finishes"', () => {
    expect(buildCommStyle({ experienceLevel: 'intermediate', pastRaces: [half] })).toContain('has 1 past race finished');
    expect(buildCommStyle({ experienceLevel: 'intermediate', pastRaces: [half, oly], hasHumanCoach: 'Yes' })).toContain('has 2 past races finished and works with a human coach');
  });
});

describe('applyAnswer', () => {
  it('refuses values outside the closed option sets', () => {
    expect(applyAnswer({}, {}, { step: 'language', language: 'fr' }, TODAY)).toBeNull();
    expect(applyAnswer({}, {}, { step: 'hours', hoursPerWeek: 99 }, TODAY)).toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'adaptive', motivation: 'Fame' }, TODAY),
    ).toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'constraints', fixedConstraints: ['Funday'] }, TODAY),
    ).toBeNull();
  });

  // Regression (CodeRabbit, PR #38): these optional fields were guarded by a
  // truthy check, so a *present but malformed* value — null, '', 0, false —
  // skipped `inSet` entirely and was written into the stored profile despite the
  // declared string type. Only `undefined` means "left unanswered".
  it.each([
    ['motivation', null],
    ['motivation', false],
    ['hasHumanCoach', ''],
  ])('refuses a present-but-malformed %s (%p)', (field, value) => {
    expect(
      applyAnswer({}, {}, { step: 'adaptive', [field]: value } as never, TODAY),
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
      applyAnswer({}, {}, { step: 'constraints', [field]: value } as never, TODAY),
    ).toBeNull();
  });

  it('still treats an omitted weeklySessionDay as legitimate', () => {
    expect(applyAnswer({}, {}, { step: 'constraints' }, TODAY)).not.toBeNull();
  });

  it('still treats an omitted optional answer as legitimate', () => {
    // The other half of the same rule: an empty adaptive submission is a valid
    // answer (every question there is optional), so it must not be refused.
    expect(applyAnswer({}, {}, { step: 'adaptive' }, TODAY)).not.toBeNull();
  });

  it('refuses empty or oversized free text', () => {
    const date = '2027-08-15';
    expect(applyAnswer({}, {}, { step: 'race', raceTarget: '   ', raceDate: date }, TODAY)).toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'race', raceTarget: 'x'.repeat(300), raceDate: date }, TODAY),
    ).toBeNull();
    // The cap itself, on both sides: a name of exactly the limit is a legal
    // name, and only the one after it is not.
    expect(
      applyAnswer({}, {}, { step: 'race', raceTarget: 'x'.repeat(200), raceDate: date }, TODAY),
    ).not.toBeNull();
    expect(
      applyAnswer({}, {}, { step: 'race', raceTarget: 'x'.repeat(201), raceDate: date }, TODAY),
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
      { step: 'pastRaces', pastRaces: null },
      { step: 'hours', hoursPerWeek: '8' },
      { step: 'adaptive', sportBackground: 'Runner' }, // string, not array
      { step: 'adaptive', bestTime: 99 },
      { step: 'constraints', fixedConstraints: 'Monday' },
    ];
    for (const payload of bad) {
      expect(() =>
        applyAnswer({}, {}, payload as unknown as Parameters<typeof applyAnswer>[2], TODAY),
      ).not.toThrow();
      expect(
        applyAnswer({}, {}, payload as unknown as Parameters<typeof applyAnswer>[2], TODAY),
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
    const after = applyAnswer(before, { adaptive: true }, { step: 'language', language: 'da' }, TODAY);
    expect(after?.answers).toEqual({ ...before, language: 'da' });
    expect(after?.submitted).toEqual({ adaptive: true });
  });

  it('marks the optional steps submitted even when empty', () => {
    const adaptive = applyAnswer({}, {}, { step: 'adaptive' }, TODAY);
    expect(adaptive?.submitted.adaptive).toBe(true);
    const constraints = applyAnswer({}, {}, { step: 'constraints' }, TODAY);
    expect(constraints?.submitted.constraints).toBe(true);
    expect(constraints?.answers.fixedConstraints).toEqual([]);
  });
});

// ── Race Distance and the Race — training-architecture/02 ────────────────────

describe('Race Distance is asked of every athlete, from a closed set', () => {
  it('accepts each of the four distances', () => {
    for (const distance of RACE_DISTANCES) {
      expect(
        applyAnswer({}, {}, { step: 'distance', raceDistance: distance }, TODAY)?.answers
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
        } as unknown as Parameters<typeof applyAnswer>[2], TODAY),
      ).toBeNull();
    }
  });

  it('is asked before the race itself, and of an athlete who has no race', () => {
    // Deliberately not a property of the race: an athlete building toward an
    // Ironman with nothing booked still needs an Ironman-shaped week — the
    // winter-base athlete of *Distancens Arkitektur* §14.
    expect(nextStep({ language: 'en', pastRaces: [half, half, half, half], experienceLevel: 'veteran' }, { name: true })).toBe('distance');
    expect(
      nextStep({ language: 'en', pastRaces: [], experienceLevel: 'veteran', raceDistance: 'Full', hoursPerWeek: 8 }, { name: true }),
    ).toBe('race');
  });
});

describe('a Race is optional, and saying so is an answer', () => {
  it('takes a name and a date', () => {
    const after = applyAnswer({}, {}, {
      step: 'race',
      raceTarget: 'Ironman Copenhagen',
      raceDate: '2027-08-15',
    }, TODAY);
    expect(after?.answers.raceTarget).toBe('Ironman Copenhagen');
    expect(after?.answers.raceDate).toBe('2027-08-15');
    expect(after?.answers.noRaceYet).toBeUndefined();
  });

  it('records "I do not have one yet" as a decision, not an absence', () => {
    // The distinction the acceptance criterion turns on: an athlete who said
    // they have no race is not the same as one who was never asked, and only
    // the first should be allowed past this step.
    const after = applyAnswer({}, {}, { step: 'race', noRaceYet: true }, TODAY);
    expect(after?.answers.noRaceYet).toBe(true);
    expect(after?.answers.raceTarget).toBeUndefined();
    expect(after?.answers.raceDate).toBeUndefined();

    const unasked = {};
    expect(nextStep({ language: 'en', pastRaces: [], experienceLevel: 'veteran', raceDistance: 'Half', hoursPerWeek: 8 }, { name: true }))
      .toBe('race');
    expect(
      nextStep(
        {
          language: 'en',
          pastRaces: [],
          experienceLevel: 'veteran',
          raceDistance: 'Half',
          hoursPerWeek: 8,
          ...after?.answers,
          ...unasked,
        },
        { name: true },
      ),
    ).toBe('adaptive');
  });

  it('sends a name-only race back to the race step, the same as completion would', () => {
    // CodeRabbit on PR #60. A record from before the date was asked carries a
    // `raceTarget` and no `raceDate`. Treating that as answered let the athlete
    // through every remaining step and then fail at `completeProfile`, which
    // requires both — stuck on a finished questionnaire with nothing to fix.
    // Both functions now ask the same question of the same two fields.
    const nameOnly = {
      language: 'en',
      pastRaces: [] as PastRace[],
      experienceLevel: 'veteran' as const,
      raceDistance: 'Half' as const,
      hoursPerWeek: 8,
      raceTarget: 'Ironman Copenhagen',
    };

    const rest = { name: true, adaptive: true, history: true, constraints: true };
    expect(nextStep(nameOnly, rest)).toBe('race');
    // Past the race step the walk continues to the closing question, not to done.
    expect(nextStep({ ...nameOnly, raceDate: '2027-08-15' }, rest)).toBe('firstDay');
    expect(nextStep({ ...nameOnly, raceDate: '2027-08-15', firstDay: 'today' }, rest)).toBe('done');
  });

  it('refuses a race without a date, and a date that is not one', () => {
    // A name with no date is what the old free-text field allowed, and it is
    // what the four regexes then guessed at. There is no guessing now, so the
    // date has to be given.
    expect(applyAnswer({}, {}, { step: 'race', raceTarget: 'Ironman Copenhagen' } as unknown as Parameters<typeof applyAnswer>[2], TODAY)).toBeNull();
    for (const bad of ['2027-02-30', 'August 2027', '15/08/2027', '2027', '']) {
      expect(
        applyAnswer({}, {}, {
          step: 'race',
          raceTarget: 'Ironman Copenhagen',
          raceDate: bad,
        } as unknown as Parameters<typeof applyAnswer>[2], TODAY),
      ).toBeNull();
    }
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

  // Each sentence is one closed branch; pinned word for word so a branch cannot
  // silently fall through to its neighbour (the gate found every one of these
  // could, 2026-09-15).
  it('renders exactly one sentence per experience and motivation branch', () => {
    const n = 'The athlete';
    expect(buildCommStyle({ experienceLevel: 'beginner', motivation: 'Performance' })).toBe(
      `${n} is a first-timer with a performance mindset. Be direct and explain the reasoning behind training choices.`,
    );
    expect(buildCommStyle({ experienceLevel: 'beginner', motivation: 'Community' })).toBe(
      `${n} is motivated by the community experience. Keep coaching warm and encouraging while being clear about expectations.`,
    );
    expect(buildCommStyle({ experienceLevel: 'beginner', motivation: 'Completion' })).toBe(
      `${n} is a first-time Ironman athlete. Keep coaching encouraging and process-focused. Avoid jargon. Celebrate effort and consistency.`,
    );
    expect(buildCommStyle({ experienceLevel: 'intermediate', pastRaces: [half, oly], hasHumanCoach: 'Yes' })).toBe(
      `${n} has 2 past races finished and works with a human coach. Respect their experience. Be direct and evidence-led. Focus on tactical adjustments rather than fundamentals.`,
    );
    expect(buildCommStyle({ experienceLevel: 'intermediate', pastRaces: [half] })).toBe(
      `${n} has 1 past race finished. Respect their experience. Be direct and evidence-led. Focus on tactical adjustments rather than fundamentals.`,
    );
    expect(buildCommStyle({ experienceLevel: 'veteran', trackedMetrics: ['Power'] })).toBe(
      `${n} is a veteran Ironman athlete. Tracks Power. Use data-aware language. Be direct and performance-focused. Skip beginner explanations entirely.`,
    );
    expect(buildCommStyle({ experienceLevel: 'veteran', trackedMetrics: [] })).toBe(
      `${n} is a veteran Ironman athlete. Use data-aware language. Be direct and performance-focused. Skip beginner explanations entirely.`,
    );
    expect(buildCommStyle({ experienceLevel: 'veteran' })).not.toContain('Tracks');
  });

  it('says nothing for an unknown or missing experience level', () => {
    expect(buildCommStyle({})).toBe('');
    expect(buildCommStyle({ experienceLevel: 'elite' as never })).toBe('');
  });
});

describe('applyAnswer — the adaptive step’s optional times', () => {
  it('stores a given best time and drops an empty one rather than storing ""', () => {
    const given = applyAnswer({}, {}, { step: 'adaptive', bestTime: '11:30', targetTime: '' }, TODAY);
    expect(given?.answers.bestTime).toBe('11:30');
    expect(given?.answers.targetTime).toBeUndefined();
    expect('targetTime' in (given?.answers ?? {})).toBe(true);
    const none = applyAnswer({}, {}, { step: 'adaptive' }, TODAY);
    expect(none?.answers.bestTime).toBeUndefined();
  });
});

// ── toCoachOnboarding / completeProfile ───────────────────────────────────────

describe('toCoachOnboarding', () => {
  it('maps answers into the prompt shape, nulling what was skipped', () => {
    expect(
      toCoachOnboarding({
        sportBackground: ['Runner', 'Gym'],
        hoursPerWeek: 5,
        motivation: 'Completion',
      }),
    ).toEqual({
      sportBackground: ['Runner', 'Gym'],
      hoursPerWeek: 5,
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

  it('assembles the profile columns from a finished answer set', () => {
    const profile = completeProfile(
      {
        language: 'da',
        hoursPerWeek: 8, experienceLevel: 'intermediate',
        raceDistance: 'Full',
        raceTarget: 'Ironman Copenhagen',
        raceDate: '2026-08-30',
        hasHumanCoach: 'Yes',
      },
    );
    expect(profile).toEqual({
      experienceLevel: 'intermediate',
      hoursPerWeek: 8,
      pastRaces: [],
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
        hoursPerWeek: 8, experienceLevel: 'beginner',
        raceDistance: 'Olympic',
        noRaceYet: true,
      },
    );
    expect(profile?.race).toBeNull();
    expect(profile?.raceDistance).toBe('Olympic');
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
          hoursPerWeek: 8, experienceLevel: 'beginner',
          raceDistance: 'Half',
          raceTarget: 'Ironman Copenhagen',
          noRaceYet: true,
        },
      )?.race,
    ).toBeNull();
    expect(
      completeProfile(
        { hoursPerWeek: 8, experienceLevel: 'beginner', raceDistance: 'Half', raceTarget: 'Ironman Copenhagen' },
      ),
    ).toBeNull();
  });

  it('refuses to complete while the race question is simply unanswered', () => {
    // Distance answered, race neither given nor declined: the flow has not
    // reached its end, and a profile written now would be missing a decision
    // nobody made.
    expect(
      completeProfile({ hoursPerWeek: 8, experienceLevel: 'beginner', raceDistance: 'Half' }),
    ).toBeNull();
  });

  it('refuses to complete without a Race Distance, which everyone answers', () => {
    expect(
      completeProfile(
        { hoursPerWeek: 8, experienceLevel: 'beginner', raceTarget: 'IM CPH', raceDate: '2027-08-15' },
      ),
    ).toBeNull();
  });

  it('returns null while required answers are missing', () => {
    expect(completeProfile({ language: 'da' })).toBeNull();
    expect(completeProfile({ experienceLevel: 'beginner' })).toBeNull();
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

  it('gives the closing first-day question and its three answers a string in every locale', () => {
    // `training-architecture/36`. The step renders its own labels rather than
    // going through OPTION_MESSAGE_KEY, so the loop below cannot see it.
    for (const key of ['stepFirstDay', 'qFirstDay', 'qFirstDaySub', 'firstDayToday', 'firstDayTomorrow', 'firstDayNextMonday']) {
      for (const [locale, catalogue] of Object.entries(catalogues)) {
        expect((catalogue.Onboarding as Record<string, string>)[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it('gives every rendered option a message key', () => {
    const labelled = [
      ...ONBOARDING_OPTIONS.sportBackground,
      ...ONBOARDING_OPTIONS.motivation,
      ...ONBOARDING_OPTIONS.weakestDiscipline,
      ...ONBOARDING_OPTIONS.hasHumanCoach,
      ...ONBOARDING_OPTIONS.trackedMetrics,
      ...ONBOARDING_OPTIONS.days,
      ...ONBOARDING_OPTIONS.weeklySessionDay,
      ...ONBOARDING_OPTIONS.yearsTraining,
      ...ONBOARDING_OPTIONS.recentWeeklyVolume,
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

// ── The history step — garmin-integration/03 ─────────────────────────────────

describe('the history step (garmin-integration/03)', () => {
  const throughRace = (level: 'beginner' | 'intermediate' | 'veteran') => ({
    language: 'en',
    pastRaces: level === 'beginner' ? [] : level === 'intermediate' ? [half] : [half, half, oly, oly],
    experienceLevel: level,
    raceDistance: 'Full' as const,
    hoursPerWeek: 8,
    noRaceYet: true,
  });

  it('asks for history after the adaptive step, for every experience level', () => {
    for (const level of ['beginner', 'intermediate', 'veteran'] as const) {
      expect(nextStep(throughRace(level), { name: true, adaptive: true })).toBe('history');
      expect(nextStep(throughRace(level), { name: true, adaptive: true, history: true })).toBe('constraints');
    }
  });

  it('counts an empty submission and stores the two closed-set answers', () => {
    expect(applyAnswer({}, {}, { step: 'history' }, TODAY)?.submitted.history).toBe(true);
    const answered = applyAnswer({}, { name: true }, { step: 'history', yearsTraining: '3-6', recentWeeklyVolume: '6-10h' }, TODAY);
    expect(answered?.answers).toEqual({ yearsTraining: '3-6', recentWeeklyVolume: '6-10h' });
    expect(answered?.submitted).toEqual({ name: true, history: true });
  });

  it('clears an answer the athlete took back', () => {
    const cleared = applyAnswer({ yearsTraining: '1-3', recentWeeklyVolume: '3-6h' }, {}, { step: 'history' }, TODAY);
    expect(cleared?.answers.yearsTraining).toBeUndefined();
    expect(cleared?.answers.recentWeeklyVolume).toBeUndefined();
  });

  it.each([
    [{ yearsTraining: '20' }],
    [{ recentWeeklyVolume: '40h' }],
    [{ yearsTraining: null }],
    [{ recentWeeklyVolume: '' }],
  ])('refuses a value outside the options (%o)', (fields) => {
    expect(applyAnswer({}, {}, { step: 'history', ...fields } as never, TODAY)).toBeNull();
  });

  it('leaves the floor where it was: a skipped history step still completes the profile', () => {
    const answers = { ...throughRace('beginner') };
    expect(completeProfile(answers)).not.toBeNull();
    expect(completeProfile({ ...answers, yearsTraining: undefined, recentWeeklyVolume: undefined })).not.toBeNull();
  });
});

describe('the first training day (training-architecture/36)', () => {
  it('asks for the first day after the constraints step, and only then is done', () => {
    const answers = {
      language: 'da',
      pastRaces: [],
      experienceLevel: 'beginner' as const,
      raceDistance: 'Full' as const,
      hoursPerWeek: 8,
      raceTarget: 'IM CPH',
      raceDate: '2027-08-15',
    };
    const submitted = { name: true, adaptive: true, history: true, constraints: true };

    expect(ONBOARDING_STEPS.at(-1)).toBe('firstDay');
    expect(nextStep(answers, submitted)).toBe('firstDay');
    expect(nextStep({ ...answers, firstDay: 'today' }, submitted)).toBe('done');
    expect(previousStep('firstDay')).toBe('constraints');
    expect(stepAfter('constraints')).toBe('firstDay');
    expect(stepAfter('firstDay')).toBe('done');
  });

  it('refuses a first-day value outside the three offered', () => {
    expect(
      applyAnswer({}, {}, { step: 'firstDay', firstDay: 'someday' } as never, TODAY),
    ).toBeNull();
    // Stored as the date it resolved to, so a later read cannot re-resolve it
    // into a different day.
    expect(applyAnswer({}, {}, { step: 'firstDay', firstDay: 'today' }, TODAY)?.answers.firstDay).toBe(TODAY);
    expect(
      applyAnswer({}, {}, { step: 'firstDay', firstDay: 'nextMonday' }, '2026-09-23')?.answers.firstDay,
    ).toBe('2026-09-28');
  });

  it('pre-selects today before 18:00 and tomorrow from 18:00, on the athlete’s own clock', () => {
    // The device knows its own local time, so the cutoff is decided where the
    // question is asked. The server stores only which of the three was picked:
    // a wrong guess about the hour changes the pre-selection, never the plan.
    expect(defaultFirstDay(new Date('2026-09-23T17:59:00'))).toBe('today');
    expect(defaultFirstDay(new Date('2026-09-23T18:00:00'))).toBe('tomorrow');
    expect(defaultFirstDay(new Date('2026-09-23T23:30:00'))).toBe('tomorrow');
    expect(defaultFirstDay(new Date('2026-09-23T00:01:00'))).toBe('today');
  });

  it('reads a stored day back to the tile it came from, and defaults when it matches none', () => {
    const evening = new Date('2026-09-23T19:00:00');
    const morning = new Date('2026-09-23T09:00:00');
    expect(firstDayChoiceOf('2026-09-23', '2026-09-23', morning)).toBe('today');
    expect(firstDayChoiceOf('2026-09-24', '2026-09-23', morning)).toBe('tomorrow');
    expect(firstDayChoiceOf('2026-09-28', '2026-09-23', morning)).toBe('nextMonday');
    // A date from another day — Back across midnight — falls back to the clock.
    expect(firstDayChoiceOf('2026-01-01', '2026-09-23', evening)).toBe('tomorrow');
    expect(firstDayChoiceOf(undefined, '2026-09-23', morning)).toBe('today');
  });

  it('gives the chosen day only while it is still ahead — a day that has arrived is no constraint', () => {
    // Both the block arithmetic and the Coach's draft read this, so "already
    // arrived" collapses to undefined once rather than in each of them.
    expect(chosenFirstDay({ onboardingAnswers: { firstDay: '2026-09-28' } }, '2026-09-23')).toBe('2026-09-28');
    expect(chosenFirstDay({ onboardingAnswers: { firstDay: '2026-09-24' } }, '2026-09-23')).toBe('2026-09-24');
    // The day itself is not ahead of itself, so there is nothing left to honour.
    expect(chosenFirstDay({ onboardingAnswers: { firstDay: '2026-09-23' } }, '2026-09-23')).toBeUndefined();
    // And once it is behind, it is spent — every later week plans normally.
    expect(chosenFirstDay({ onboardingAnswers: { firstDay: '2026-09-28' } }, '2026-09-29')).toBeUndefined();
    // Never asked, or no answers at all.
    expect(chosenFirstDay({}, '2026-09-23')).toBeUndefined();
    expect(chosenFirstDay(undefined, '2026-09-23')).toBeUndefined();
  });

  it('resolves each choice against today — next Monday is the next one, never today', () => {
    expect(firstDayDate('today', '2026-09-23')).toBe('2026-09-23'); // a Wednesday
    expect(firstDayDate('tomorrow', '2026-09-23')).toBe('2026-09-24');
    expect(firstDayDate('nextMonday', '2026-09-23')).toBe('2026-09-28');
    // Asked on a Monday, "next Monday" is a week away, not this morning.
    expect(firstDayDate('nextMonday', '2026-09-28')).toBe('2026-10-05');
    // And on a Sunday it is tomorrow, not eight days out.
    expect(firstDayDate('nextMonday', '2026-09-27')).toBe('2026-09-28');
  });
});
