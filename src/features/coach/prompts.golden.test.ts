import { describe, it, expect } from 'vitest';
import { buildWeeklyContext, renderWeeklyPrompt, buildChatPrompt } from './prompts';
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
 * When a prompt is *deliberately* changed — new copy, a new block, retired
 * guidance — these snapshots are meant to be updated (`vitest -u`) and the diff
 * read as the review artifact: it shows exactly what every athlete will now be
 * coached by. A snapshot that changes in a commit that did not mean to change
 * the Coach's instructions is the bug this file is here to catch.
 */

const BASE: CheckIn = {
  body: 7,
  mental: 7,
  energy: 7,
  sleep: 7,
  pulse: 50,
  phase: 'Base Building',
  commStyle: '',
  experienceLevel: 'intermediate',
  sessionCount: 5,
  language: 'English',
  weeklySessionDay: 'Monday',
  fixedConstraints: [],
  equipment: [],
};

// A fixed date so the weekday-dependent PLANNING DAY line is deterministic.
// 2026-08-18 is a Tuesday; BASE prefers Monday, so the line renders.
const TODAY = '2026-08-18';

describe('golden — the Weekly Session prompt, per arc', () => {
  // The arc is the largest conditional in the prompt and the one a refactor is
  // most likely to get subtly wrong, so every branch is pinned: 1, 2, 3, and 4+.
  for (const weeklySessionNumber of [1, 2, 3, 4]) {
    it(`renders identically for session ${weeklySessionNumber}`, () => {
      const ctx = buildWeeklyContext(
        { ...BASE, weeklySessionNumber },
        [],
        [],
        [],
        [],
        null,
        TODAY,
      );
      expect(renderWeeklyPrompt(ctx)).toMatchSnapshot();
    });
  }

  it('renders identically with every optional block populated', () => {
    const ctx = buildWeeklyContext(
      {
        ...BASE,
        weeklySessionNumber: 4,
        commStyle: 'terse, technical, no reassurance',
        raceTarget: 'Ironman Copenhagen 2027',
        fixedConstraints: ['Thursday'],
        language: 'da',
        equipment: [
          { id: 'e1', category: 'bike', name: 'Canyon Speedmax', details: 'CF SLX', addedDate: '2026-01-04' },
          { id: 'e2', category: 'watch', name: 'Garmin Fenix 8', details: null, addedDate: '2026-02-11' },
        ],
        onboarding: {
          sportBackground: ['running', 'swimming'],
          weeklyHours: '10-12',
          motivation: 'finish under 11 hours',
          weakestDiscipline: 'swim',
        },
      },
      [
        {
          dateKey: '2026-08-13',
          sessionType: 'Intensity',
          body: 8,
          mind: 4,
          comment: 'legs heavy from Tuesday',
        },
      ],
      // Three occurrences is the pattern-detection threshold, so this populates
      // the PATTERNS block rather than silently rendering nothing.
      [
        { sleep: 5.5, pushedBack: true, sessionType: 'intensity' },
        { sleep: 5.0, pushedBack: true, sessionType: 'intensity' },
        { sleep: 5.8, pushedBack: true, sessionType: 'intensity' },
      ],
      [{ date: '2026-08-14', sessionType: 'Endurance', position: 2 }],
      ['2026-08-20'],
      {
        moves: [
          { sessionType: 'Intensity', from: '2026-08-12', to: '2026-08-15' },
        ],
        creations: [{ sessionType: 'Strength', dateKey: '2026-08-16', retro: true }],
      },
      TODAY,
    );
    expect(renderWeeklyPrompt(ctx)).toMatchSnapshot();
  });

  // The PLANNING DAY line is suppressed on two different conditions, and a
  // suppressed line is exactly the kind of thing a whitespace refactor breaks
  // quietly — the block simply vanishes and nothing else looks wrong.
  it('renders identically when today IS the preferred Weekly Session Day', () => {
    // 2026-08-17 is a Monday, and BASE prefers Monday: no PLANNING DAY line.
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4 },
      [],
      [],
      [],
      [],
      null,
      '2026-08-17',
    );
    expect(renderWeeklyPrompt(ctx)).not.toContain('PLANNING DAY');
    expect(renderWeeklyPrompt(ctx)).toMatchSnapshot();
  });

  it('renders identically when the Weekly Session Day is Flexible', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4, weeklySessionDay: 'Flexible' },
      [],
      [],
      [],
      [],
      null,
      TODAY,
    );
    expect(renderWeeklyPrompt(ctx)).not.toContain('PLANNING DAY');
    expect(renderWeeklyPrompt(ctx)).toMatchSnapshot();
  });

  it('renders identically when the equipment nudge fires', () => {
    // Sessions 2-3 with no equipment: the one combination that emits the nudge.
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 2, equipment: [] },
      [],
      [],
      [],
      [],
      null,
      TODAY,
    );
    expect(renderWeeklyPrompt(ctx)).toMatchSnapshot();
  });
});

describe('golden — the Coach Chat prompt', () => {
  it('renders identically with no Reference', () => {
    expect(buildChatPrompt(BASE, TODAY)).toMatchSnapshot();
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
          onboarding: { weeklyHours: '8-10', motivation: 'first Ironman' },
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
