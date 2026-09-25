import { describe, expect, it } from 'vitest';
import {
  buildBriefingContext,
  renderBriefingPrompt,
  type BriefingPlanEntry,
  type BriefingReports,
} from './briefing';
import { briefingInputStats } from './briefing-stats';

const plan: BriefingPlanEntry[] = [
  { date: '2026-08-04', type: 'Endurance', status: 'completed', duration: 90, zone: 'Z2', note: 'steady' },
  { date: '2026-08-05', type: 'Intensity', status: 'skipped', duration: 60, zone: 'Z4', note: null },
  { date: '2026-08-06', type: 'Intensity', status: 'planned', duration: 60, zone: 'Z4', note: null },
];

const reports: BriefingReports = {
  profile: {
    phase: 'Build',
    experienceLevel: 'intermediate',
    raceTarget: 'IM Copenhagen',
    sessionsPerWeek: 6,
    onboarding: null,
    capacity: null,
    races: [],
    hasTargetRace: true,
  },
  reflections: [
    { date: '2026-08-04', type: 'Endurance', body: 8, mind: 10, comment: 'hard' },
    { date: '2026-08-02', type: 'Recovery', body: 9, mind: 9, comment: 'easy spin' },
    { date: '2026-08-03', type: 'Intensity', body: 5, mind: 8, comment: 'legs heavy' },
    { date: '2026-08-01', type: 'Endurance', body: 6, mind: 6, comment: null },
    // An empty comment is no comment: the prompt renders nothing for it.
    { date: '2026-07-30', type: 'Tempo', body: 7, mind: 7, comment: '' },
  ],
};

const blocks = {
  blocks: [{ name: 'Build', endDate: '2026-09-01', authoredBy: 'arithmetic' as const }],
  phase: 'Build',
  raceUnrealistic: null,
  staleSet: null,
};

describe('briefingInputStats — what reaches the prompt, counted', () => {
  it('counts plan rows, skips, rated reflections, comments and prompt size', () => {
    const ctx = buildBriefingContext({ today: '2026-08-08', plan, blocks, reports, transcripts: null });
    const prompt = renderBriefingPrompt(ctx);

    expect(briefingInputStats(ctx, prompt)).toEqual({
      sessions: 3,
      skipped: 1,
      reflections: 5,
      withComment: 3,
      promptChars: prompt.length,
      promptTokensApprox: Math.ceil(prompt.length / 4),
      block: 'Build',
    });
  });

  it('counts nothing when reports are withheld and names no block without one', () => {
    const ctx = buildBriefingContext({ today: '2026-08-08', plan, reports: null, transcripts: null });

    expect(briefingInputStats(ctx, renderBriefingPrompt(ctx))).toMatchObject({
      sessions: 3,
      reflections: 0,
      withComment: 0,
      block: null,
    });
  });
});
