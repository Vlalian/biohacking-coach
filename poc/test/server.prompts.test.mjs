import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildWeeklyContext, renderWeeklyPrompt } = require('../server.js');

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
