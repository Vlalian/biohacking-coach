import { describe, expect, it } from 'vitest';
import { initialsOf, rosterCardOf } from './roster-card';
import { trainingBlocks } from './training-blocks';
import { openHorizonBlocks } from './open-horizon';

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

  // Changed by training-architecture/13: a race already run is no longer
  // counted to as "0 days". The athlete's own Plan tab stops naming it the
  // day after, and the card reveals nothing that page does not.
  it('names no race once it has been run, and counts race day itself as zero', () => {
    expect(rosterCardOf({ race: { name: 'Kalmar', date: '2026-09-20' }, blocks: [] }, TODAY).race).toBeNull();
    expect(rosterCardOf({ race: { name: 'Kalmar', date: TODAY }, blocks: [] }, TODAY).race).toEqual({ name: 'Kalmar', days: 0 });
  });

  // Changed by training-architecture/13: an athlete with no race has the Open
  // Horizon's blocks, and the card shows the block they are in — no race.
  it('shows the Open Horizon\'s block with no race', () => {
    const blocks = openHorizonBlocks('2026-09-14', TODAY);
    expect(rosterCardOf({ race: null, blocks }, TODAY)).toEqual({ race: null, block: { name: 'Base', week: 3, weeks: 6 } });
  });

  it('has a race but no block when today falls outside every block', () => {
    const card = rosterCardOf({ race: RACE, blocks: trainingBlocks('2026-09-01', '2026-09-20') }, TODAY);
    expect(card.race).toEqual({ name: 'Ironman Copenhagen', days: 164 });
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
