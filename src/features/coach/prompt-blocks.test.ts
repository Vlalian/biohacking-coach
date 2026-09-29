import { describe, expect, it } from 'vitest';

import { COACH_IDENTITY, groundingBlock, healthFactsBlock, onboardingBlock, openingBlock, recentWeeksBlock } from './prompt-blocks';

describe('groundingBlock', () => {
  it('GROUNDING: asked what it knows, the Coach looks up before answering and never describes the tool as its scope (knowledge-oracle/07)', () => {
    // The PR #82 smoke: "hvad ved du noget om med fagligt grundlag" got the
    // lookup tool's description read back as the Coach's scope, and no call.
    const g = groundingBlock();
    expect(g).toMatch(/^GROUNDING: Before stating a training-science fact, call look_up_training_science\./);
    expect(g).toContain('Asked what you know or have evidence for, look up the topic named before answering');
    expect(g).toContain('never describe the lookup tool as your scope');
    expect(g).toContain('Never write citations');
  });
});

describe('onboardingBlock — hours a week (training-architecture/35)', () => {
  it('renders hours/week from the integer and omits the line when unknown', () => {
    // `block()` returns null for an empty section; the string form is what the prompt sees.
    expect(String(onboardingBlock({ hoursPerWeek: 8 }))).toContain('hours/week=8');
    expect(String(onboardingBlock({ hoursPerWeek: 8 }))).toContain('a ceiling to plan within');
    expect(String(onboardingBlock({ hoursPerWeek: null }))).not.toContain('hours/week');
    expect(String(onboardingBlock({}))).not.toContain('hours/week');
  });
});

describe('recentWeeksBlock (training-architecture/44)', () => {
  it('renders one line per week, naming the week and what happened in it', () => {
    const rendered = recentWeeksBlock([
      {
        weekStart: '2026-09-21',
        plannedMinutes: 195,
        doneMinutes: 60,
        completed: 1,
        skipped: 1,
        byType: [{ type: 'Endurance', completed: 1, doneMinutes: 60 }],
        soFar: false,
        imported: 0,
        unrecorded: 0,
        device: null,
      },
    ]);
    expect(rendered).toContain('RECENT WEEKS:');
    expect(rendered).toContain('2026-09-21');
    expect(rendered).toContain('Endurance');
  });

  const empty = (weekStart: string) => ({
    weekStart,
    plannedMinutes: 0,
    doneMinutes: 0,
    completed: 0,
    skipped: 0,
    byType: [],
    soFar: false,
    imported: 0,
    unrecorded: 0,
    device: null,
  });

  it('is null when there is no history, so assemble drops it', () => {
    expect(recentWeeksBlock(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'].map(empty))).toBeNull();
  });

  it('states an empty week among real ones rather than skipping it', () => {
    const rendered = recentWeeksBlock([
      empty('2026-09-14'),
      { ...empty('2026-09-21'), plannedMinutes: 90, skipped: 1 },
    ]);
    expect(rendered).toContain('- Week of 2026-09-14: empty — nothing planned, nothing done');
    expect(rendered).toContain('- Week of 2026-09-21: 0.0h done of 1.5h planned; 0 completed, 1 skipped');
    expect(rendered).not.toContain('done by type');
  });

  it('counts a week as history when any one of its figures is non-zero', () => {
    // Sessions without a duration add no minutes, so a week can hold a
    // completed or skipped session and still show 0.0h.
    for (const week of [
      { ...empty('2026-09-21'), plannedMinutes: 45 },
      { ...empty('2026-09-21'), completed: 1 },
      { ...empty('2026-09-21'), skipped: 1 },
    ]) {
      expect(recentWeeksBlock([empty('2026-09-14'), week])).toContain('- Week of 2026-09-21: 0.0h done of');
    }
  });

  it('says how many sessions came from the device, and that they need no rating (garmin-integration/07)', () => {
    const rendered = recentWeeksBlock([
      { ...empty('2026-09-21'), plannedMinutes: 120, doneMinutes: 120, completed: 2, imported: 2 },
    ]);
    expect(rendered).toContain('2 completed, 0 skipped, 2 imported from the athlete\'s device (no rating expected)');
    expect(recentWeeksBlock([{ ...empty('2026-09-21'), completed: 1 }])).not.toContain('imported');
  });

  it('says how many past planned sessions nobody recorded (training-architecture/45)', () => {
    const rendered = recentWeeksBlock([{ ...empty('2026-09-21'), plannedMinutes: 120, completed: 1, unrecorded: 2 }]);
    expect(rendered).toContain('1 completed, 0 skipped, 2 not recorded');
    expect(recentWeeksBlock([{ ...empty('2026-09-21'), completed: 1 }])).not.toContain('not recorded');
  });

  it('counts a week that holds only unrecorded sessions as history', () => {
    expect(recentWeeksBlock([{ ...empty('2026-09-21'), unrecorded: 1 }])).toContain('- Week of 2026-09-21: 0.0h done of');
  });

  it('says what the device recorded, and only what it has (training-architecture/52)', () => {
    const week = { ...empty('2026-09-21'), completed: 2, doneMinutes: 120, plannedMinutes: 120 };
    expect(recentWeeksBlock([{ ...week, device: { distanceKm: 43.5, avgHr: 140 } }])).toContain('; device: 43.5 km, avg HR 140');
    expect(recentWeeksBlock([{ ...week, device: { distanceKm: 0, avgHr: 140 } }])).toContain('; device: avg HR 140');
    expect(recentWeeksBlock([{ ...week, device: { distanceKm: 12, avgHr: null } }])).toContain('; device: 12.0 km');
    expect(recentWeeksBlock([{ ...week, device: { distanceKm: 12, avgHr: null } }])).not.toContain('avg HR');
    expect(recentWeeksBlock([week])).not.toContain('device');
    // Nothing to say is nothing appended: the line ends where it did.
    expect(recentWeeksBlock([{ ...week, device: { distanceKm: 0, avgHr: null } }])).toMatch(/2 completed, 0 skipped$/m);
  });

  it('says the current week is only up to today, empty or not', () => {
    const rendered = recentWeeksBlock([
      { ...empty('2026-09-14'), plannedMinutes: 60, doneMinutes: 60, completed: 1 },
      { ...empty('2026-09-21'), soFar: true },
    ]);
    expect(rendered).toContain('- Week of 2026-09-14: 1.0h done of 1.0h planned');
    expect(rendered).toContain('- Week of 2026-09-21 (this week, up to today): empty — nothing planned, nothing done');
    expect(recentWeeksBlock([{ ...empty('2026-09-21'), plannedMinutes: 90, doneMinutes: 30, completed: 1, soFar: true }])).toContain(
      '- Week of 2026-09-21 (this week, up to today): 0.5h done of 1.5h planned',
    );
  });
});

describe('the identity the model is given (showable-version/46)', () => {
  it('tells the model it is Momentum, never Coach', () => {
    expect(COACH_IDENTITY).toBe('You are Momentum, the AI coach in a luxury Ironman training app.');
    expect(openingBlock('en', 'Coach Chat.')).toBe(`${COACH_IDENTITY} Coach Chat.`);
    expect(openingBlock('en', 'Coach Chat.')).not.toMatch(/You are Coach\b/);
  });

  it('splices the language directive in after the identity', () => {
    expect(openingBlock('da', 'Coach Chat.')).toMatch(/^You are Momentum, the AI coach in a luxury Ironman training app\.\nLANGUAGE: Respond in Danish\.[\s\S]* Coach Chat\.$/);
  });
});

describe('healthFactsBlock (E1, training-architecture/52)', () => {
  it('lists each open injury by what it prevents, since when, and how much it bothers them', () => {
    const rendered = healthFactsBlock({
      injuries: [{ prevents: { swim: 'full', bike: 'easy', run: 'none' }, since: '2026-09-20', botherRating: 3 }],
      illnesses: [{ since: '2026-09-27', botherRating: null }],
    });
    expect(rendered).toContain('OPEN INJURIES AND ILLNESS');
    expect(rendered).toContain('- Injury since 2026-09-20: swim full, bike easy only, run none; bothering them 3/5');
    expect(rendered).toContain('- Illness since 2026-09-27');
    expect(rendered).not.toContain('2026-09-27; bothering');
  });

  it('says how much an illness bothers them when they said', () => {
    expect(healthFactsBlock({ injuries: [], illnesses: [{ since: '2026-09-27', botherRating: 2 }] })).toContain(
      '- Illness since 2026-09-27; bothering them 2/5',
    );
  });

  it('is absent when nothing is open', () => {
    expect(healthFactsBlock({ injuries: [], illnesses: [] })).toBeNull();
  });
});
