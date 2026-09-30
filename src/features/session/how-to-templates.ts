/**
 * The session how-to templates (`training-architecture/26`): one reviewed text
 * per Session Type and sport, the grounded baseline `how-to.ts` fits to a
 * session's own minutes and zone.
 *
 * Pure data, in both Athlete Languages, kept here rather than in the message
 * catalogues for the reason `consent/disclosure.ts` gives: each entry is
 * reviewed as a unit against its source, and the catalogues have no notion of
 * a source or a review. No I/O and no server imports, so the Session Drawer and
 * the Head Coach's review import it as they are.
 *
 * **Every number and every cue comes from a source, recorded on the entry.**
 * The sources are *Distancens Arkitektur* rev 4 (`.scratch/training-architecture/sources.md`;
 * §07 the warm-up, cool-down and rest timings, §08 the main set's form per type
 * and sport, and its subsection "Hvem gør hvad" the rest between speed reps) and the Knowledge Oracle corpus register
 * (`.scratch/knowledge-oracle/corpus.md`). Where §08 gives a range, the value
 * chosen here sits inside it. A cue with no source is not shipped: the
 * templates carry two or three, fewer than a coach might say, on purpose.
 *
 * **`reviewed: false` on every entry until Mads has read it** (Mads,
 * 2026-09-26: he reviews them before testers see them; the domain expert
 * later). The ticket is not done while any shipped entry says false.
 */

/** The disciplines a template is written for. The arithmetic's own names (`block-sessions.ts`). */
export const HOW_TO_SPORTS = ['swim', 'bike', 'run', 'brick'] as const;
export type HowToSport = (typeof HOW_TO_SPORTS)[number];

/** The Session Types a Planned Session can carry (`PLAN_TYPES` in `weekly-session.ts`). */
export type HowToType = 'Endurance' | 'Intensity' | 'Tempo' | 'Recovery';

/** The rest after one rep, and whether it is meant to recover the athlete fully. */
export interface Rest {
  seconds: number;
  fullRecovery: boolean;
}

/** The rest a rep of this many seconds of work is followed by. */
export type RestRule = (workSeconds: number) => Rest;

/**
 * Distancens Arkitektur §08 (Hvem gør hvad): rep length is the clearest driver
 * of the rest between speed/VO2max reps. From about two minutes a rep, the
 * plans rest shorter than or about equal to the work.
 */
const LONG_REP_SECONDS = 120;

/**
 * Distancens Arkitektur §08 (Hvem gør hvad): below that, and above all under
 * 60–90 s, a fixed and generous rest of about two minutes that recovers the
 * athlete fully, even when it is longer than the work.
 */
const FULL_RECOVERY_SECONDS = 120;

/**
 * The rest between speed/VO2max reps on the bike and the run: a pure function
 * of rep length (Distancens Arkitektur §08, Hvem gør hvad; rev 4, 2026-09-29).
 * A rep under {@link LONG_REP_SECONDS} gets {@link FULL_RECOVERY_SECONDS},
 * flagged as full recovery; a longer rep rests as long as it worked, the top of
 * "shorter than or about equal to the work".
 *
 * The same section finds the Training Phase a fourth driver: full recovery
 * belongs early and in base, the tighter rest near the target race. The
 * how-to sees only the session's own fields, so that refinement is not here;
 * it is a follow-up on `training-architecture/26`.
 *
 * Export-for-test: the two-minute boundary sits between the two rep lengths
 * the templates ship (1 min on the run, 3 min on the bike), so no template
 * reaches it. Delete the export freely if a template ever does.
 */
export const INTENSITY_REST: RestRule = (workSeconds) =>
  workSeconds < LONG_REP_SECONDS
    ? { seconds: FULL_RECOVERY_SECONDS, fullRecovery: true }
    : { seconds: workSeconds, fullRecovery: false };

/** §08 threshold/tempo: the rest is a share of the work time, about a sixth to a half. */
const TEMPO_REST_SHARE = 0.25;
const TEMPO_REST: RestRule = (workSeconds) => ({ seconds: Math.round(workSeconds * TEMPO_REST_SHARE), fullRecovery: false });

/**
 * Timed reps with rest, on the bike and the run. When the fewest reps at
 * `workMinutes` do not fit, the rep is shortened a minute at a time down to
 * `shortestWorkMinutes`, keeping the rep count and the rest rule (Mads,
 * 2026-09-30); both sit inside §08's per-rep range.
 */
export interface IntervalsForm {
  reps: { min: number; max: number };
  workMinutes: number;
  shortestWorkMinutes: number;
  rest: RestRule;
}

/**
 * A distance repeated with a short fixed rest until the main set's time is
 * up. Swim reps are written in metres in every source plan, and a session here
 * is written in minutes; turning one into the other needs a pace no source
 * gives, so the count is left to the clock and the range from §08 is shown
 * beside it.
 */
export interface SwimRepeatsForm {
  reps: { min: number; max: number };
  metres: number;
  restSeconds: number;
}

/** Bike then run, repeated, with a short transition between every leg. */
export interface BrickForm {
  reps: { min: number; max: number };
  bikeMinutes: number;
  runMinutes: number;
  transitionSeconds: number;
}

/**
 * The main set's form (§08), told apart by its fields. A template with no form
 * (`main: null`) runs its main part as one steady block at the session's zone
 * for Endurance and Recovery. Intensity and Tempo with no form (no sport known,
 * so §08 has no row) show the main part's zone in words and no set.
 */
export type MainSetForm = IntervalsForm | SwimRepeatsForm | BrickForm;

/** One focus cue, in both Athlete Languages. */
export interface Cue {
  en: string;
  da: string;
}

export interface HowToTemplate {
  type: HowToType;
  /** `any` is the sport-neutral fallback for a session whose sport is unknown. */
  sport: HowToSport | 'any';
  /** The main set's form, or null for one steady block. */
  main: MainSetForm | null;
  /** Two or three cues, in the order shown. */
  focus: Cue[];
  /** Whether a session over an hour adds {@link FUELLING_CUE}. */
  fuelling: boolean;
  /** Where every number and cue on this entry comes from. Never shown to the athlete. */
  source: string;
  /** Mads's review of this entry's text (en and da). */
  reviewed: boolean;
}

// ── The cues, each with its source ────────────────────────────────────────────

/** Corpus #2 (Nøst 2024, intensity distribution); the intensity languages, §09. */
const KEEP_EASY: Cue = {
  en: 'Keep it truly easy, in the zone given, even if it feels too slow.',
  da: 'Hold det reelt roligt i den angivne zone, også selvom det føles for langsomt.',
};

/** §07: MyProCoach warms up flat, in Z2, in every session. */
const WARM_UP_FLAT: Cue = {
  en: 'Warm up on the flat at an easy Z2 before the main part.',
  da: 'Varm op på fladt terræn i roligt Z2 før hoveddelen.',
};

/** §07: 220's rule, a warm-up ramping from easy to vigorous. */
const WARM_UP_RAMP: Cue = {
  en: 'Build the warm-up from easy to brisk, so you start the main set ready.',
  da: 'Byg opvarmningen op fra roligt til friskt, så du er klar til hovedsættet.',
};

/** §07: 220's rule, a cool-down of 3–5 min easy, then stretching. */
const COOL_DOWN_STRETCH: Cue = {
  en: 'Cool down easy for a few minutes, then stretch.',
  da: 'Køl roligt ned et par minutter, og stræk så ud.',
};

/** §07: MyProCoach gives the rest between reps as time plus zone, active (e.g. 60 s Z1). */
const REST_ACTIVE: Cue = {
  en: 'Keep moving easily in Z1 during the rests.',
  da: 'Bliv i rolig bevægelse i Z1 i pauserne.',
};

/** §08: threshold/tempo rest is a share of the work, about a sixth to a half. */
const TEMPO_REST_CUE: Cue = {
  en: 'The rests are short next to the work: start the next rep when the rest is up.',
  da: 'Pauserne er korte i forhold til arbejdet: start næste gentagelse, når pausen er slut.',
};

/** §07: swim rest is time only, passive; §08: short, fixed, barely changing with distance. */
const SWIM_REST: Cue = {
  en: 'Rest at the wall for the set time, the same after every rep.',
  da: 'Hold pause ved kanten i den faste tid, den samme efter hver gentagelse.',
};

/** §08: a brick's transition is fixed and short, 60–120 s. */
const BRICK_TRANSITION: Cue = {
  en: 'Keep the change from bike to run short, one to two minutes.',
  da: 'Gør skiftet fra cykel til løb kort, et til to minutter.',
};

/**
 * Added to an Endurance session over an hour on the bike, the run or a brick.
 * Corpus #5–#7 (Kerksick 2017, Podlogar 2022, Martinez 2023), as the
 * register's territory lines give them: carbohydrate intake during long
 * sessions and training the gut for race day.
 */
export const FUELLING_CUE: Cue = {
  en: 'Over an hour: practise eating and drinking the way you plan to on race day.',
  da: 'Over en time: øv dig i at spise og drikke, som du planlægger på konkurrencedagen.',
};

// ── The main-set forms, each value inside §08's range ─────────────────────────

/**
 * §08 speed/VO2max · bike: 4–12 reps of 30 s – 5 min; a 3-minute rep is a long
 * one. Shortened to 1 min at the least: four 1-minute reps with their 2 min
 * rest take 10 min, and the shortest split session leaves 12, so a rep under a
 * minute is never needed.
 */
const INTENSITY_BIKE: MainSetForm = { reps: { min: 4, max: 12 }, workMinutes: 3, shortestWorkMinutes: 1, rest: INTENSITY_REST };
/** §08 speed/VO2max · run: 4–10 reps of 60 s – 3 min; a 1-minute rep is a short one, fully recovered, and already §08's shortest. */
const INTENSITY_RUN: MainSetForm = { reps: { min: 4, max: 10 }, workMinutes: 1, shortestWorkMinutes: 1, rest: INTENSITY_REST };
/** §08 speed/VO2max · swim: 4–20 × 25–300 m (mostly 50–150 m), rest short and fixed, 10–45 s. */
const INTENSITY_SWIM: MainSetForm = { reps: { min: 4, max: 20 }, metres: 100, restSeconds: 20 };
/** §08 threshold/tempo · bike: 2–8 reps of 5–30 min, rest ≈ 15–30 % of the work; shortened to 5 min at the least. */
const TEMPO_BIKE: MainSetForm = { reps: { min: 2, max: 8 }, workMinutes: 10, shortestWorkMinutes: 5, rest: TEMPO_REST };
/** §08 threshold/tempo · run: 2–6 reps of 3–15 min, rest ≈ 15–50 % of the work; shortened to 3 min at the least. */
const TEMPO_RUN: MainSetForm = { reps: { min: 2, max: 6 }, workMinutes: 8, shortestWorkMinutes: 3, rest: TEMPO_REST };
/** §08 threshold/tempo · swim: 2–8 × 100–600 m, rest very short and fixed, 5–30 s. */
const TEMPO_SWIM: MainSetForm = { reps: { min: 2, max: 8 }, metres: 300, restSeconds: 15 };
/** §08 brick: 2–4 × bike 6–20 min then run 5–10 min, a fixed transition of 60–120 s. */
const BRICK: MainSetForm = { reps: { min: 2, max: 4 }, bikeMinutes: 15, runMinutes: 8, transitionSeconds: 90 };

const TIMINGS = 'Distancens Arkitektur §06 (anatomy), §07 (warm-up, cool-down, rest)';

/**
 * The library. A session finds its entry by type and sport, and falls back to
 * the type's `any` entry when its sport has none (`how-to.ts`).
 */
export const HOW_TO_TEMPLATES: readonly HowToTemplate[] = [
  {
    type: 'Endurance',
    sport: 'swim',
    main: null,
    focus: [KEEP_EASY, COOL_DOWN_STRETCH],
    fuelling: false,
    source: `${TIMINGS}, swim warm-up 150–250 m and cool-down ~100 m; corpus #2 (Nøst 2024), §09`,
    reviewed: false,
  },
  {
    type: 'Endurance',
    sport: 'brick',
    main: BRICK,
    focus: [KEEP_EASY, BRICK_TRANSITION],
    fuelling: true,
    source: `${TIMINGS}; §08 (brick), §11 (bricks); corpus #2 (Nøst 2024); corpus #5–#7 (fuelling)`,
    reviewed: false,
  },
  {
    type: 'Endurance',
    sport: 'any',
    main: null,
    focus: [KEEP_EASY, WARM_UP_FLAT],
    fuelling: true,
    source: `${TIMINGS}; corpus #2 (Nøst 2024), §09; corpus #5–#7 (fuelling)`,
    reviewed: false,
  },
  {
    type: 'Recovery',
    sport: 'any',
    main: null,
    focus: [KEEP_EASY, COOL_DOWN_STRETCH],
    fuelling: false,
    source: `${TIMINGS}; corpus #2 (Nøst 2024), §09`,
    reviewed: false,
  },
  {
    type: 'Tempo',
    sport: 'bike',
    main: TEMPO_BIKE,
    focus: [WARM_UP_RAMP, TEMPO_REST_CUE, REST_ACTIVE],
    fuelling: false,
    source: `${TIMINGS}; §08 (threshold/tempo · bike)`,
    reviewed: false,
  },
  {
    type: 'Tempo',
    sport: 'run',
    main: TEMPO_RUN,
    focus: [WARM_UP_RAMP, TEMPO_REST_CUE, REST_ACTIVE],
    fuelling: false,
    source: `${TIMINGS}; §08 (threshold/tempo · run)`,
    reviewed: false,
  },
  {
    type: 'Tempo',
    sport: 'swim',
    main: TEMPO_SWIM,
    focus: [WARM_UP_RAMP, SWIM_REST],
    fuelling: false,
    source: `${TIMINGS}, swim warm-up 150–250 m and cool-down ~100 m; §08 (threshold/tempo · swim)`,
    reviewed: false,
  },
  {
    type: 'Tempo',
    sport: 'brick',
    main: BRICK,
    focus: [WARM_UP_RAMP, BRICK_TRANSITION],
    fuelling: false,
    source: `${TIMINGS}; §08 (brick), §11 (bricks)`,
    reviewed: false,
  },
  {
    type: 'Tempo',
    sport: 'any',
    main: null,
    focus: [WARM_UP_RAMP, COOL_DOWN_STRETCH],
    fuelling: false,
    source: `${TIMINGS}`,
    reviewed: false,
  },
  {
    type: 'Intensity',
    sport: 'bike',
    main: INTENSITY_BIKE,
    focus: [WARM_UP_RAMP, REST_ACTIVE, COOL_DOWN_STRETCH],
    fuelling: false,
    source: `${TIMINGS}; §08 (speed/VO2max · bike), §08 (Hvem gør hvad: rest by rep length)`,
    reviewed: false,
  },
  {
    type: 'Intensity',
    sport: 'run',
    main: INTENSITY_RUN,
    focus: [WARM_UP_RAMP, REST_ACTIVE, COOL_DOWN_STRETCH],
    fuelling: false,
    source: `${TIMINGS}; §08 (speed/VO2max · run), §08 (Hvem gør hvad: rest by rep length)`,
    reviewed: false,
  },
  {
    type: 'Intensity',
    sport: 'swim',
    main: INTENSITY_SWIM,
    focus: [WARM_UP_RAMP, SWIM_REST],
    fuelling: false,
    source: `${TIMINGS}, swim warm-up 150–250 m and cool-down ~100 m; §08 (speed/VO2max · swim)`,
    reviewed: false,
  },
  {
    type: 'Intensity',
    sport: 'brick',
    main: BRICK,
    focus: [WARM_UP_RAMP, BRICK_TRANSITION],
    fuelling: false,
    source: `${TIMINGS}; §08 (brick), §11 (bricks)`,
    reviewed: false,
  },
  {
    type: 'Intensity',
    sport: 'any',
    main: null,
    focus: [WARM_UP_RAMP, COOL_DOWN_STRETCH],
    fuelling: false,
    source: `${TIMINGS}`,
    reviewed: false,
  },
];
