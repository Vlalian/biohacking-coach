import { describe, expect, it } from 'vitest';
import { initialsOf, rosterCardOf } from './roster-card';
import { trainingBlocks } from './training-blocks';

/**
 * What a Roster card says about one athlete (Mads, 2026-09-24): the race and
 * the days left to it, and the block today falls in. Pure — the page reads the
 * horizon and hands it here.
 */
const TODAY = '2026-10-01';
const RACE = { name: 'Ironman Copenhagen', date: '2027-03-14' };

describe('rosterCardOf', () => {
  it('names the race with the days left, and the block with the week inside it', () => {
    const card = rosterCardOf({ race: RACE, blocks: trainingBlocks(TODAY, RACE.date) }, TODAY);
    expect(card.race).toEqual({ name: 'Ironman Copenhagen', days: 164 });
    expect(card.block).toEqual({ name: expect.any(String), week: 1, weeks: expect.any(Number) });
    expect(card.block!.weeks).toBeGreaterThanOrEqual(1);
  });

  it('counts a race that has passed as zero days, never negative', () => {
    const card = rosterCardOf({ race: { name: 'Kalmar', date: '2026-09-20' }, blocks: [] }, TODAY);
    expect(card.race).toEqual({ name: 'Kalmar', days: 0 });
  });

  it('says nothing about a block with no race, even if blocks were handed in', () => {
    const blocks = trainingBlocks(TODAY, RACE.date);
    expect(rosterCardOf({ race: null, blocks }, TODAY)).toEqual({ race: null, block: null });
  });

  it('has a race but no block when today falls outside every block', () => {
    const card = rosterCardOf({ race: RACE, blocks: trainingBlocks(TODAY, RACE.date) }, '2028-01-01');
    expect(card.race).toEqual({ name: 'Ironman Copenhagen', days: 0 });
    expect(card.block).toBeNull();
  });
});

describe('initialsOf', () => {
  it('takes the first and last word, upper-cased', () => {
    expect(initialsOf('nadia holm')).toBe('NH');
    expect(initialsOf('Anna Marie Dahl')).toBe('AD');
  });

  it('takes one letter from a single name and ignores stray whitespace', () => {
    expect(initialsOf('  Sam  ')).toBe('S');
    expect(initialsOf('Alex   Rivera')).toBe('AR');
  });

  it('falls back to a dot when there is no name at all', () => {
    expect(initialsOf('')).toBe('·');
    expect(initialsOf('   ')).toBe('·');
  });
});
