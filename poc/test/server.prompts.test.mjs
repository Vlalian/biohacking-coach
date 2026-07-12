import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildWeeklyContext, renderWeeklyPrompt, buildCoachContext, renderPrompt, buildChatPrompt } = require('../server.js');

const BASE = {
  body: 7, mental: 7, energy: 7, sleep: 7, pulse: 50,
  phase: 'Base Building', personaName: 'Mads', commStyle: '',
  experienceLevel: 'intermediate', sessionCount: 5,
  language: 'English', weeklySessionDay: 'Monday',
  fixedConstraints: [], equipment: {},
};

describe('buildWeeklyContext — raceTarget', () => {
  it('forwards raceTarget from checkIn', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, raceTarget: 'Ironman Copenhagen' },
      [], [], [], []
    );
    expect(ctx.raceTarget).toBe('Ironman Copenhagen');
  });

  it('forwards undefined raceTarget gracefully', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1 },
      [], [], [], []
    );
    expect(ctx.raceTarget).toBeUndefined();
  });
});

describe('renderWeeklyPrompt — Week 1 raceTarget', () => {
  it('includes raceTarget in Week 1 prompt', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, raceTarget: 'Ironman Copenhagen' },
      [], [], [], []
    );
    expect(renderWeeklyPrompt(ctx)).toContain('Ironman Copenhagen');
  });

  it('has no RACE instruction when raceTarget absent', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1 },
      [], [], [], []
    );
    expect(renderWeeklyPrompt(ctx)).not.toContain('RACE:');
  });

  it('does not include raceTarget in Week 4+ prompt', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4, raceTarget: 'Ironman Copenhagen' },
      [], [], [], []
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

const ONBOARDING = {
  sportBackground:   ['Runner', 'Gym'],
  weeklyHours:       '3–6h',
  motivation:        'Completion',
  bestTime:          null,
  weakestDiscipline: null,
  hasHumanCoach:     null,
  targetTime:        null,
  trackedMetrics:    null,
};

describe('onboarding answers reach every Coach prompt', () => {
  it('weekly prompt lists the answers with a never-re-ask instruction', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 1, onboarding: ONBOARDING }, [], [], [], []);
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).toContain('ONBOARDING PROFILE');
    expect(prompt).toContain('NEVER ask for this information again');
    expect(prompt).toContain('Sport background: Runner, Gym');
    expect(prompt).toContain('Current weekly training hours: 3–6h');
    expect(prompt).toContain('Motivation: Completion');
  });

  it('negotiation prompt includes the answers, experience level and race', () => {
    const ctx = buildCoachContext({ ...BASE, onboarding: ONBOARDING, raceTarget: 'Ironman Copenhagen' }, [], null);
    const prompt = renderPrompt(ctx);
    expect(prompt).toContain('ONBOARDING PROFILE');
    expect(prompt).toContain('xp=intermediate');
    expect(prompt).toContain('race=Ironman Copenhagen');
  });

  it('chat prompt includes the answers and race', () => {
    const prompt = buildChatPrompt({ ...BASE, onboarding: ONBOARDING, raceTarget: 'Ironman Copenhagen' });
    expect(prompt).toContain('ONBOARDING PROFILE');
    expect(prompt).toContain('race=Ironman Copenhagen');
  });

  it('omits the block entirely when nothing was answered', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 1, onboarding: {} }, [], [], [], []);
    // The arc instructions may reference the block by name; the block itself must be absent.
    expect(renderWeeklyPrompt(ctx)).not.toContain('athlete already answered these at onboarding');
  });
});

// ── Multi-session days (Weekly plan lands in the session store) ───────────────

const { buildPlanExtractionPrompt, formatSkippedSessions } = require('../server.js');

describe('plan extraction prompt — multi-session days', () => {
  it('allows two session objects with the same dayOfWeek', () => {
    const prompt = buildPlanExtractionPrompt('Coach: two on Monday.');
    expect(prompt).toContain('same dayOfWeek');
    expect(prompt).not.toContain('exactly 7 objects');
  });

  it('defines dayOrder by array order, not an index field', () => {
    const prompt = buildPlanExtractionPrompt('Coach: plan.');
    expect(prompt.toLowerCase()).toContain('array order');
    expect(prompt).not.toContain('sessionIndex');
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
    const withPos = formatSkippedSessions([{ date: '2026-07-15', sessionType: 'Endurance', position: 2 }]);
    expect(withPos).toContain('2nd Endurance');
    const noPos = formatSkippedSessions([{ date: '2026-07-15', sessionType: 'Endurance' }]);
    expect(noPos).not.toContain('1st');
    expect(noPos).not.toContain('2nd');
  });

  it('reaches the weekly prompt through renderWeeklyPrompt', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [],
      [{ date: '2026-07-15', sessionType: 'Endurance', position: 2 }], []);
    expect(renderWeeklyPrompt(ctx)).toContain('2nd Endurance');
  });
});
