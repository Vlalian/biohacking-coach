import { describe, it, expect } from 'vitest';
import { buildChatPrompt } from './prompts';
import { planningWindow } from './planning-window';
import type { CheckIn, SessionContext } from './check-in';
import type { WeekSession } from './week';

/**
 * Golden prompts — the regression net for prompt *assembly*, not prompt content.
 *
 * `prompts.test.ts` asserts the rules that matter (no identity reaches a prompt,
 * a block appears when its data does). This file asserts something narrower and
 * blunter: that a given context renders the exact same string it rendered
 * before. It exists because the assembly is being restructured, and a
 * restructuring of assembly must be a no-op on output — one changed newline is a
 * regression, not a tidy-up.
 *
 * Provenance, stated exactly: the snapshots were captured by running this file
 * against the pre-refactor `prompts.ts`, but the file, its snapshots and the
 * refactor all landed in ONE commit — so git alone does not prove the no-op, and
 * this comment should not pretend otherwise. What was actually verified, and can
 * be re-verified from history, is that every snapshot is identical to the
 * pre-refactor output once whitespace runs are normalised: the only change is
 * blank-line separation between sections, plus one dropped trailing newline.
 * Two independent reviewers reproduced that by rendering `origin/main`'s
 * `prompts.ts` beside this branch's.
 *
 * From here on the file does what it says: it pins output against future change.
 *
 * The Weekly Session's goldens lived here until the behavior was retired
 * (ADR 0007, amended 2026-09-16; `training-architecture/21`): the prompt they
 * pinned no longer exists, and the arc it carried is pinned below as the chat
 * prompt's, per stage.
 *
 * When a prompt is *deliberately* changed — new copy, a new block, retired
 * guidance — these snapshots are meant to be updated (`vitest -u`) and the diff
 * read as the review artifact: it shows exactly what every athlete will now be
 * coached by. A snapshot that changes in a commit that did not mean to change
 * the Coach's instructions is the bug this file is here to catch.
 */

const BASE: CheckIn = {
  readiness: { body: 7, energy: 7, sleepQuality: 7, mental: 7, sleepHours: 7, restingPulse: 50 },
  phase: 'Base Building',
  commStyle: '',
  experienceLevel: 'intermediate',
  presenceStage: 'full',
  language: 'English',
  weeklySessionDay: 'Monday',
  fixedConstraints: [],
  equipment: [],
};

// A fixed date so nothing weekday-dependent drifts. 2026-08-18 is a Tuesday.
const TODAY = '2026-08-18';

describe('golden — the Coach Chat prompt, per Presence Arc stage (training-architecture/21)', () => {
  // The arc is the largest conditional in the prompt and the one a refactor is
  // most likely to get subtly wrong, so every stage is pinned — including the
  // Guided Tour beats that ride on it: orientation at cold start, the
  // Equipment nudge while building with an empty tab.
  for (const presenceStage of ['cold_start', 'building', 'full'] as const) {
    it(`renders identically at ${presenceStage}`, () => {
      expect(buildChatPrompt({ ...BASE, presenceStage }, TODAY)).toMatchSnapshot();
    });
  }

  it('renders identically at building once the Equipment tab is filled — no nudge', () => {
    const prompt = buildChatPrompt(
      {
        ...BASE,
        presenceStage: 'building',
        equipment: [
          { id: 'e1', category: 'bike', name: 'Canyon Speedmax', details: 'CF SLX', addedDate: '2026-01-04' },
        ],
      },
      TODAY,
    );
    expect(prompt).not.toContain('EQUIPMENT NUDGE');
    expect(prompt).toMatchSnapshot();
  });
});

describe('golden — the Coach Chat prompt', () => {
  it('renders identically with no Reference', () => {
    expect(buildChatPrompt(BASE, TODAY)).toMatchSnapshot();
  });

  // preferred-name/02: the one name that reaches a prompt, by the athlete's
  // choice. Pinned beside the nameless case above, which must not move.
  it('renders identically with a Preferred Name', () => {
    expect(buildChatPrompt(BASE, TODAY, null, [], null, 'Mads')).toMatchSnapshot();
  });

  // training-architecture/20: the one conversation may agree a week. The bound
  // and the staged week render exactly as the Weekly Session renders them.
  it('renders identically with a planning window and a staged week', () => {
    const staged = [
      { date: '2026-08-20', type: 'Endurance' as const, durationMinutes: 60, zone: 'Z2', note: 'keep it easy' },
      { date: '2026-08-22', type: 'Intensity' as const, durationMinutes: 45, zone: 'Z4', note: null },
    ];
    const prompt = buildChatPrompt(BASE, TODAY, null, [], { window: planningWindow(TODAY), stagedProposal: staged });
    expect(prompt).toContain('PLANNING WINDOW: 2026-08-18 to 2026-08-23');
    expect(prompt).toContain('PROPOSED WEEK');
    expect(prompt).toContain('SAVING THE PLAN');
    expect(prompt).toMatchSnapshot();
  });

  it('renders no planning lines at all when the chat was given no window', () => {
    const prompt = buildChatPrompt(BASE, TODAY);
    expect(prompt).not.toContain('PLANNING WINDOW');
    expect(prompt).not.toContain('SAVING THE PLAN');
  });

  it('renders identically with a Reference and every optional field', () => {
    const reference: SessionContext = {
      type: 'Endurance',
      dayLabel: '2026-08-19',
      duration: '90 min',
      zone: 'Z2',
      note: 'steady, hold the low end',
      status: 'skipped',
    };
    expect(
      buildChatPrompt(
        {
          ...BASE,
          commStyle: 'warm, plain language',
          raceTarget: 'Ironman Copenhagen 2027',
          fixedConstraints: ['Thursday', 'Sunday'],
          language: 'da',
          equipment: [
            { id: 'e1', category: 'shoes', name: 'Vaporfly 3', details: null, addedDate: '2026-03-02' },
          ],
          onboarding: { hoursPerWeek: 14, motivation: 'first Ironman' },
        },
        TODAY,
        reference,
      ),
    ).toMatchSnapshot();
  });

  // The week block is the surface an athlete actually asks "should I do
  // tomorrow's intervals?" against, so its copy is pinned like the rest: mixed
  // authorship (which decides whether the Coach may reshape a session at all),
  // mixed status, a same-type Double, and the tapped session rendered short
  // because the Reference block below carries its detail.
  it('renders identically with the current week rendered', () => {
    const week: WeekSession[] = [
      {
        date: '2026-08-17',
        sessionType: 'Endurance',
        status: 'completed',
        origin: 'coach',
        title: null,
        durationMinutes: 90,
        zone: '2',
        note: 'steady, hold the low end',
        position: 1,
      },
      {
        date: '2026-08-17',
        sessionType: 'Endurance',
        status: 'planned',
        origin: 'athlete',
        title: 'masters squad',
        durationMinutes: 40,
        zone: null,
        note: 'club swim',
        position: 2,
      },
      {
        date: '2026-08-19',
        sessionType: 'Intensity',
        status: 'planned',
        origin: 'head_coach',
        title: null,
        durationMinutes: 75,
        zone: '4',
        note: 'threshold set — race sharpness',
        isReference: true,
      },
      {
        // A Head Coach session the athlete did *not* tap, carrying a note: the
        // one path where a note would have been rendered. It must not be.
        date: '2026-08-20',
        sessionType: 'Endurance',
        status: 'planned',
        origin: 'head_coach',
        title: null,
        durationMinutes: 120,
        zone: '2',
        note: 'steady — ride it with Bjorn if you can',
      },
      {
        date: '2026-08-21',
        sessionType: 'Recovery',
        status: 'skipped',
        origin: 'coach',
        title: null,
        durationMinutes: 45,
        zone: '1',
        note: null,
      },
    ];
    const reference: SessionContext = {
      type: 'Intensity',
      dayLabel: '2026-08-19',
      duration: '75 min',
      zone: 'Z4',
      note: 'threshold set — race sharpness',
      status: 'planned',
    };
    expect(buildChatPrompt(BASE, TODAY, reference, week)).toMatchSnapshot();
  });

  // The counterpart: a week with no Head-Coach session spends no prompt on a
  // rule that cannot apply.
  it('renders identically for a week the Coach planned alone', () => {
    const week: WeekSession[] = [
      {
        date: '2026-08-18',
        sessionType: 'Tempo',
        status: 'planned',
        origin: 'coach',
        title: null,
        durationMinutes: 60,
        zone: '3',
        note: null,
      },
    ];
    const prompt = buildChatPrompt(BASE, TODAY, null, week);
    expect(prompt).not.toContain('AUTHORITY');
    expect(prompt).toMatchSnapshot();
  });
});

/**
 * The shape every real athlete's prompt actually has today (code-health/07).
 *
 * `BASE` above carries readiness because it was written when the app always sent
 * some — an invented 7/7/7/7.5/55. No Check-in feature exists, so what the live
 * app renders is this: a STATE line of real facts only, and the Coach told to
 * ask. These two snapshots are therefore the ones to read when reviewing a prompt
 * change; the `BASE` ones pin the path that comes alive when a Check-in lands.
 */
describe('golden — no Check-in has ever been given', () => {
  /**
   * The shape every real athlete's prompt actually has today (code-health/07).
   *
   * `BASE` above carries a readiness because it was written when the app always
   * sent one — an invented 7/7/7/7.5/55. No Check-in feature exists, so what the
   * live app renders is this. These snapshots are therefore the ones to read when
   * reviewing a prompt change; the `BASE` ones pin the path that comes alive when
   * a Check-in lands.
   *
   * Everything else is populated, deliberately: the interesting thing to pin is
   * not a bare prompt, it is where the NO CHECK-IN DATA block sits among the
   * blocks a real athlete has — between STATE and their onboarding answers.
   */
  // BASE carries a readiness; this is BASE without one. Spelled as an explicit
  // object rather than a destructure-and-discard so the fixture reads as what it
  // is — a check-in that never had scores — instead of one with them removed.
  const NO_READINESS: CheckIn = {
    phase: BASE.phase,
    experienceLevel: BASE.experienceLevel,
    language: BASE.language,
    weeklySessionDay: BASE.weeklySessionDay,
    fixedConstraints: BASE.fixedConstraints,
    // No stage on purpose: BASE says full presence, which cannot be true of an
    // athlete who has never reported anything, so the case below sets its own.
    raceTarget: 'Ironman Copenhagen 2027',
    commStyle: 'terse, technical, no reassurance',
    equipment: [
      { id: 'e1', category: 'bike' as const, name: 'Canyon Speedmax', details: 'CF SLX', addedDate: '2026-01-04' },
    ],
    onboarding: {
      sportBackground: ['running'],
      // An integer since training-architecture/35 (the buckets are gone): a
      // fixture that invents a value the onboarding cannot produce pins a
      // prompt no athlete will ever see.
      hoursPerWeek: 12,
      motivation: 'finish under 11 hours',
    },
  };

  it('Coach Chat renders without readiness', () => {
    // Cold start, because that is what `presence-repository` reads for an
    // athlete with no reflections and no check-ins — the first meeting, where
    // the Coach has nothing but onboarding and must not imply it can see how
    // the athlete slept.
    expect(buildChatPrompt({ ...NO_READINESS, presenceStage: 'cold_start' }, TODAY)).toMatchSnapshot();
  });
});
