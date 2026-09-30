import { describe, it, expect } from 'vitest';
import { addDays } from '@/lib/date';
import { blockPurpose } from './training-blocks';
import {
  hasRaceHorizon,
  isRaceTooClose,
  lastPassedRaceDate,
  openHorizonBlocks,
  openHorizonStart,
} from './open-horizon';

/**
 * `training-architecture/13` — the Open Horizon: Training Blocks for an
 * athlete with no race, counted forwards from a start that happened, never
 * tapering, and never a race date in disguise.
 */
describe('openHorizonBlocks', () => {
  it('gives an open horizon 26 weeks of blocks from its start, in order, without a race block', () => {
    const b = openHorizonBlocks('2026-09-01', '2026-09-29');
    expect(b[0].startDate).toBe('2026-09-01');
    expect(addDays(b.at(-1)!.endDate, 1)).toBe(addDays('2026-09-01', 26 * 7));
    for (let i = 1; i < b.length; i++) expect(b[i].startDate).toBe(addDays(b[i - 1].endDate, 1));
    expect(b.some((x) => x.purpose === 'race' || x.purpose === 'peak')).toBe(false);
  });

  it('lays the arc out in whole weeks — base, build, build, consolidate — named for what each is for', () => {
    const b = openHorizonBlocks('2026-09-01', '2026-09-01');
    expect(b.map((x) => [x.index, x.total, x.name, x.startDate, x.endDate, x.authoredBy])).toEqual([
      [1, 4, 'Base', '2026-09-01', '2026-10-12', 'arithmetic'],
      [2, 4, 'Build', '2026-10-13', '2026-11-23', 'arithmetic'],
      [3, 4, 'Build 2', '2026-11-24', '2027-01-04', 'arithmetic'],
      [4, 4, 'Consolidate', '2027-01-05', '2027-03-01', 'arithmetic'],
    ]);
  });

  it('carries its own purposes, so no reader falls back to the race ladder and tapers the last block', () => {
    const b = openHorizonBlocks('2026-09-01', '2026-09-01');
    expect(b.map((x) => x.purpose)).toEqual(['base', 'build', 'build', 'base']);
    // The race ladder would have called the fourth of four "race" — the taper.
    expect(blockPurpose(4, 4)).toBe('race');
  });

  it('boundaries depend on the start, not on the day they are asked', () => {
    expect(openHorizonBlocks('2026-09-01', '2026-09-02')).toEqual(openHorizonBlocks('2026-09-01', '2027-02-20'));
  });

  it('keeps the arc until its 26 weeks are done, then starts a new one the day after each completed arc', () => {
    const arcStart = (today: string) => openHorizonBlocks('2026-01-01', today)[0].startDate;
    expect(arcStart('2026-01-01')).toBe('2026-01-01');
    expect(arcStart(addDays('2026-01-01', 181))).toBe('2026-01-01');
    expect(arcStart(addDays('2026-01-01', 182))).toBe(addDays('2026-01-01', 182));
    expect(arcStart(addDays('2026-01-01', 364))).toBe(addDays('2026-01-01', 364));
  });

  it('draws the arc from a start still ahead of today', () => {
    expect(openHorizonBlocks('2026-09-10', '2026-09-01')[0].startDate).toBe('2026-09-10');
  });
});

describe('openHorizonStart', () => {
  it('starts the period at the later of onboarding and the day after the last passed race', () => {
    expect(
      openHorizonStart({ onboardedAt: '2026-06-01', createdAt: '2026-05-01', lastPassedRaceDate: '2026-08-16' }),
    ).toBe('2026-08-17');
    expect(openHorizonStart({ onboardedAt: undefined, createdAt: '2026-05-01', lastPassedRaceDate: null })).toBe(
      '2026-05-01',
    );
  });

  it('onboarding wins over the account\'s creation, and over a race that passed before it', () => {
    expect(
      openHorizonStart({ onboardedAt: '2026-06-01', createdAt: '2026-05-01', lastPassedRaceDate: '2026-05-20' }),
    ).toBe('2026-06-01');
    expect(openHorizonStart({ onboardedAt: undefined, createdAt: '2026-05-01', lastPassedRaceDate: '2026-04-30' })).toBe(
      '2026-05-01',
    );
  });
});

describe('isRaceTooClose — the floor under race blocks', () => {
  it('is true from race day back to just under eight weeks, false at eight and for a race already run', () => {
    expect(isRaceTooClose('2026-09-01', '2026-09-01')).toBe(true);
    expect(isRaceTooClose('2026-09-01', addDays('2026-09-01', 55))).toBe(true);
    expect(isRaceTooClose('2026-09-01', addDays('2026-09-01', 56))).toBe(false);
    expect(isRaceTooClose('2026-09-01', '2026-08-31')).toBe(false);
  });
});

describe('hasRaceHorizon — a race far enough to build toward', () => {
  it('is eight weeks or more, and never a race already run', () => {
    expect(hasRaceHorizon('2026-09-01', addDays('2026-09-01', 56))).toBe(true);
    expect(hasRaceHorizon('2026-09-01', addDays('2026-09-01', 55))).toBe(false);
    expect(hasRaceHorizon('2026-09-01', '2026-08-01')).toBe(false);
  });
});

describe('lastPassedRaceDate', () => {
  it('is the latest race before today — a race today is not run yet', () => {
    expect(lastPassedRaceDate(['2026-08-16', '2026-09-01', '2026-03-01', '2026-12-01'], '2026-09-01')).toBe('2026-08-16');
    expect(lastPassedRaceDate(['2026-09-01'], '2026-09-01')).toBeNull();
    expect(lastPassedRaceDate([], '2026-09-01')).toBeNull();
  });
});
