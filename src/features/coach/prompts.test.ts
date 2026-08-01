import { describe, it, expect } from 'vitest';
import {
  buildWeeklyContext,
  renderWeeklyPrompt,
  buildCoachContext,
  renderPrompt,
  buildChatPrompt,
  formatSkippedSessions,
  formatWeekActivity,
  formatWeekFeedback,
} from './prompts';
import type { CheckIn, Onboarding } from './check-in';

const BASE: CheckIn = {
  body: 7,
  mental: 7,
  energy: 7,
  sleep: 7,
  pulse: 50,
  phase: 'Base Building',
  personaName: 'Mads',
  commStyle: '',
  experienceLevel: 'intermediate',
  sessionCount: 5,
  language: 'English',
  weeklySessionDay: 'Monday',
  fixedConstraints: [],
  equipment: {},
};

describe('buildWeeklyContext — raceTarget', () => {
  it('forwards raceTarget from checkIn', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, raceTarget: 'Ironman Copenhagen' },
      [],
      [],
      [],
      [],
    );
    expect(ctx.checkIn.raceTarget).toBe('Ironman Copenhagen');
  });

  it('forwards undefined raceTarget gracefully', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 1 }, [], [], [], []);
    expect(ctx.checkIn.raceTarget).toBeUndefined();
  });
});

describe('renderWeeklyPrompt — Week 1 raceTarget', () => {
  it('includes raceTarget in Week 1 prompt', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, raceTarget: 'Ironman Copenhagen' },
      [],
      [],
      [],
      [],
    );
    expect(renderWeeklyPrompt(ctx)).toContain('Ironman Copenhagen');
  });

  it('has no RACE instruction when raceTarget absent', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 1 }, [], [], [], []);
    expect(renderWeeklyPrompt(ctx)).not.toContain('RACE:');
  });

  it('does not include raceTarget in Week 4+ prompt', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4, raceTarget: 'Ironman Copenhagen' },
      [],
      [],
      [],
      [],
    );
    expect(renderWeeklyPrompt(ctx)).not.toContain('Ironman Copenhagen');
  });

  it('Week 1 prompt uses SESSION 1 arc', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 1 }, [], [], [], []);
    expect(renderWeeklyPrompt(ctx)).toContain('ARC — SESSION 1');
  });

  it('Week 4 prompt uses SESSION 4+ arc', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []);
    expect(renderWeeklyPrompt(ctx)).toContain('ARC — SESSION 4+');
  });
});

const ONBOARDING: Onboarding = {
  sportBackground: ['Runner', 'Gym'],
  weeklyHours: '3–6h',
  motivation: 'Completion',
  bestTime: null,
  weakestDiscipline: null,
  hasHumanCoach: null,
  targetTime: null,
  trackedMetrics: null,
};

describe('onboarding answers reach every Coach prompt', () => {
  it('weekly prompt lists the answers with a never-re-ask instruction', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, onboarding: ONBOARDING },
      [],
      [],
      [],
      [],
    );
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).toContain('ONBOARDING PROFILE');
    expect(prompt).toContain('NEVER ask for this information again');
    expect(prompt).toContain('Sport background: Runner, Gym');
    expect(prompt).toContain('Current weekly training hours: 3–6h');
    expect(prompt).toContain('Motivation: Completion');
  });

  it('negotiation prompt includes the answers, experience level and race', () => {
    const ctx = buildCoachContext(
      { ...BASE, onboarding: ONBOARDING, raceTarget: 'Ironman Copenhagen' },
      [],
      null,
    );
    const prompt = renderPrompt(ctx);
    expect(prompt).toContain('ONBOARDING PROFILE');
    expect(prompt).toContain('xp=intermediate');
    expect(prompt).toContain('race=Ironman Copenhagen');
  });

  it('chat prompt includes the answers and race', () => {
    const prompt = buildChatPrompt({
      ...BASE,
      onboarding: ONBOARDING,
      raceTarget: 'Ironman Copenhagen',
    });
    expect(prompt).toContain('ONBOARDING PROFILE');
    expect(prompt).toContain('race=Ironman Copenhagen');
  });

  it('omits the block entirely when nothing was answered', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, onboarding: {} },
      [],
      [],
      [],
      [],
    );
    // The arc instructions may reference the block by name; the block itself must be absent.
    expect(renderWeeklyPrompt(ctx)).not.toContain('athlete already answered these at onboarding');
  });
});

describe('weekly prompt — the propose_week_plan tool', () => {
  it('tells the Coach to propose the plan (not save) once agreed, with dated sessions', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []);
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).toContain('propose_week_plan');
    expect(prompt).toContain('does NOT save');
    expect(prompt).toContain('YYYY-MM-DD');
  });
});

describe('weekly prompt — planning-phase Doubles instruction', () => {
  it('tells the Coach it may propose two sessions on one day, never forced', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []);
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).toContain('two sessions on one day');
    expect(prompt).toContain('Never forced');
  });
});

describe('skippedSessions — natural references', () => {
  it('renders date + type without ids', () => {
    const line = formatSkippedSessions([{ date: '2026-07-15', sessionType: 'Recovery' }]);
    expect(line).toContain('2026-07-15');
    expect(line).toContain('Recovery');
    expect(line).toContain('skipped');
    expect(line).not.toMatch(/s_[a-z0-9]/);
  });

  it('adds the position qualifier only when provided (same-type Doubles)', () => {
    const withPos = formatSkippedSessions([
      { date: '2026-07-15', sessionType: 'Endurance', position: 2 },
    ]);
    expect(withPos).toContain('2nd Endurance');
    const noPos = formatSkippedSessions([{ date: '2026-07-15', sessionType: 'Endurance' }]);
    expect(noPos).not.toContain('1st');
    expect(noPos).not.toContain('2nd');
  });

  it('reaches the weekly prompt through renderWeeklyPrompt', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4 },
      [],
      [],
      [{ date: '2026-07-15', sessionType: 'Endurance', position: 2 }],
      [],
    );
    expect(renderWeeklyPrompt(ctx)).toContain('2nd Endurance');
  });
});

describe('formatWeekFeedback — dates read the same as everywhere else', () => {
  it('names the weekday from local midnight, matching the skipped/activity lines', () => {
    // A bare 'YYYY-MM-DD' parses as UTC; behind UTC that renders the previous
    // day. Both helpers must agree on the weekday for the same date.
    const feedback = formatWeekFeedback([
      { dateKey: '2026-07-15', sessionType: 'Endurance', body: 8, mind: 7 },
    ]);
    const skipped = formatSkippedSessions([
      { date: '2026-07-15', sessionType: 'Endurance' },
    ]);
    expect(feedback).toContain('Wed');
    expect(skipped).toContain('Wed');
  });
});

describe('formatWeekActivity — natural references', () => {
  it('renders a move as date + type → target day, no entity ids', () => {
    const line = formatWeekActivity({
      moves: [{ sessionType: 'Recovery', from: '2026-07-15', to: '2026-07-17' }],
      creations: [],
    });
    expect(line).toContain('moved Wed 2026-07-15 Recovery to Fri 2026-07-17');
    expect(line).not.toMatch(/s_[a-z0-9]/);
  });

  it('adds the position qualifier only for same-type Doubles', () => {
    const withPos = formatWeekActivity({
      moves: [{ sessionType: 'Endurance', from: '2026-07-15', to: '2026-07-17', position: 2 }],
      creations: [],
    });
    expect(withPos).toContain('2nd Endurance');
    const noPos = formatWeekActivity({
      moves: [{ sessionType: 'Endurance', from: '2026-07-15', to: '2026-07-17' }],
      creations: [],
    });
    expect(noPos).not.toContain('1st');
  });

  it('renders Athlete Session creations, flagging retro-logs', () => {
    const line = formatWeekActivity({
      moves: [],
      creations: [
        { sessionType: 'Strength', dateKey: '2026-07-18', retro: false },
        { sessionType: 'Mobility', dateKey: '2026-07-14', retro: true },
      ],
    });
    expect(line).toContain('added Sat 2026-07-18 Strength');
    expect(line).toContain('added Tue 2026-07-14 Mobility (retro-logged as done)');
  });

  it('returns null when there is nothing to report', () => {
    expect(formatWeekActivity({ moves: [], creations: [] })).toBeNull();
    expect(formatWeekActivity(undefined)).toBeNull();
  });
});

describe('weekly prompt — week activity as silent background', () => {
  const ACTIVITY = {
    moves: [{ sessionType: 'Recovery', from: '2026-07-15', to: '2026-07-17' }],
    creations: [{ sessionType: 'Strength', dateKey: '2026-07-18', retro: false }],
  };

  it('injects moves and creations with the no-challenge instruction', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4 },
      [],
      [],
      [],
      [],
      ACTIVITY,
    );
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).toContain('WEEK ACTIVITY');
    expect(prompt).toContain('moved Wed 2026-07-15 Recovery to Fri 2026-07-17');
    expect(prompt).toContain('added Sat 2026-07-18 Strength');
    expect(prompt.toLowerCase()).toContain('never challenge');
  });

  it('an empty log produces no move section', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4 },
      [],
      [],
      [],
      [],
      { moves: [], creations: [] },
    );
    expect(renderWeeklyPrompt(ctx)).not.toContain('WEEK ACTIVITY');
  });

  it('no weekActivity at all produces no move section', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []);
    expect(renderWeeklyPrompt(ctx)).not.toContain('WEEK ACTIVITY');
  });
});

// The no-identity-in-prompts rule (GDPR decision 1): a real name or email must
// never reach a rendered prompt. The check-in builder is what enforces this by
// never populating identity; here we prove the prompt strings carry no such field.
describe('no real identity reaches a prompt', () => {
  it('renders only the persona label and profile, never an email', () => {
    const weekly = renderWeeklyPrompt(
      buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []),
    );
    const chat = buildChatPrompt(BASE);
    expect(weekly).not.toContain('@');
    expect(chat).not.toContain('@');
  });
});
