import { describe, it, expect } from 'vitest';
import { addDays } from '@/lib/date';
import { blockPosition, currentBlock, currentPhase, trainingBlocks } from './training-blocks';

/**
 * `training-architecture/03` — the arithmetic first draft.
 *
 * Stage 1 of three, and deliberately unremarkable: its job is that a block
 * structure always exists, including for the athlete nobody is coaching. The
 * Coach adjusting it is slice 07 and the Head Coach overriding it is slice 08,
 * so the draft is not meant to be good yet without them.
 */
describe('trainingBlocks — dividing a horizon', () => {
  const TODAY = '2026-09-09';

  it('gives an athlete with a race between two and six blocks', () => {
    // *Distancens Arkitektur* §15: "Del forløbet i 2–6 blokke med hvert sit
    // formål." Both ends of the range, at both ends of a plausible horizon.
    for (const raceDate of ['2026-09-30', '2026-12-01', '2027-03-01', '2028-03-01']) {
      const blocks = trainingBlocks(TODAY, raceDate);
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(blocks.length).toBeLessThanOrEqual(6);
    }
  });

  it('divides a longer horizon into more blocks than a shorter one', () => {
    // §15 asks "Hvor mange faser tillader tidshorisonten reelt?" — so the count
    // has to answer to the time available rather than being a constant.
    const short = trainingBlocks(TODAY, '2026-11-01').length;
    const long = trainingBlocks(TODAY, '2028-03-01').length;
    expect(long).toBeGreaterThan(short);
  });

  it('spans today to the race, with no gap and no overlap', () => {
    const blocks = trainingBlocks(TODAY, '2027-06-01');

    expect(blocks[0].startDate).toBe(TODAY);
    expect(blocks[blocks.length - 1].endDate).toBe('2027-06-01');
    for (let i = 1; i < blocks.length; i += 1) {
      const previousEnd = new Date(`${blocks[i - 1].endDate}T00:00:00Z`).getTime();
      const thisStart = new Date(`${blocks[i].startDate}T00:00:00Z`).getTime();
      expect(thisStart - previousEnd).toBe(24 * 60 * 60 * 1000);
    }
  });

  it('pins boundaries to the race, so a missed week never moves them', () => {
    // The acceptance criterion, and the reason nothing is stored: the same race
    // asked about on two different days puts its later boundaries in the same
    // places. Only the block containing "today" starts later.
    const early = trainingBlocks('2026-09-09', '2027-06-01');
    const later = trainingBlocks('2026-09-23', '2027-06-01');

    expect(later[later.length - 1].endDate).toBe(early[early.length - 1].endDate);
    expect(later.length).toBe(early.length);
  });

  it('gives an athlete with no race no blocks, which is a value not an error', () => {
    // The same state as an athlete in a Recovery Period (slice 10). The Coach
    // still plans their week; it simply plans without a horizon to build toward.
    expect(trainingBlocks(TODAY, null)).toEqual([]);
  });

  it('gives no blocks for a race that has already happened', () => {
    // There is no horizon left to divide. Not an error either.
    expect(trainingBlocks(TODAY, '2026-08-01')).toEqual([]);
  });

  it('names blocks generically, because a formula cannot say what one is for', () => {
    // Stage 2 (the Coach) and stage 3 (the Head Coach) are what name a block by
    // purpose. Inventing a purpose here would be the arithmetic pretending to
    // coaching judgment it does not have.
    const blocks = trainingBlocks(TODAY, '2027-06-01');
    expect(blocks[0].name).toBe(`Block 1 of ${blocks.length}`);
    expect(blocks[0].index).toBe(1);
    expect(blocks[0].total).toBe(blocks.length);
  });

  it('is pure — the same arguments give the same answer', () => {
    // No clock, no database, no network: `today` is a parameter, as everywhere
    // else in this codebase. The acceptance criterion asks for exactly this.
    expect(trainingBlocks(TODAY, '2027-06-01')).toEqual(trainingBlocks(TODAY, '2027-06-01'));
  });
});

describe('currentPhase — the Training Phase, derived on every read', () => {
  const TODAY = '2026-09-09';

  it('is the name of the block containing today', () => {
    const blocks = trainingBlocks(TODAY, '2027-06-01');
    expect(currentPhase(TODAY, blocks)).toBe(blocks[0].name);
  });

  it('moves to the next block as time passes, without anything being rewritten', () => {
    // The defect this replaces: `computePhase` ran once at onboarding, stored a
    // string, and nothing ever recomputed it — so an athlete who onboarded
    // eleven months out was still Base Building in race week, and every Coach
    // prompt read that string as fact.
    const blocks = trainingBlocks(TODAY, '2027-06-01');
    expect(currentPhase(blocks[1].startDate, blocks)).toBe(blocks[1].name);
    expect(currentPhase(blocks[blocks.length - 1].endDate, blocks)).toBe(
      blocks[blocks.length - 1].name,
    );
  });

  it('is null for an athlete with no blocks', () => {
    expect(currentPhase(TODAY, [])).toBeNull();
  });

  it('is null for a day outside the horizon entirely', () => {
    const blocks = trainingBlocks(TODAY, '2027-06-01');
    expect(currentPhase('2026-01-01', blocks)).toBeNull();
    expect(currentPhase('2028-01-01', blocks)).toBeNull();
  });
});

describe('blockPosition — where in the block the athlete is standing', () => {
  it('counts the week within the block, and how many it has', () => {
    // The Coach needs more than which block: the first week of a block and its
    // last week call for different sessions, and "Block 2 of 5" says the same
    // thing for six weeks running.
    const blocks = trainingBlocks('2026-09-09', '2027-06-01');
    const block = blocks[1];

    expect(blockPosition(block.startDate, block)).toEqual({ week: 1, weeks: expect.any(Number) });
    expect(blockPosition(addDays(block.startDate, 7), block).week).toBe(2);
    expect(blockPosition(block.endDate, block).week).toBe(
      blockPosition(block.startDate, block).weeks,
    );
  });

  it('never reports a week outside the block it was given', () => {
    const [block] = trainingBlocks('2026-09-09', '2027-06-01');
    const { weeks } = blockPosition(block.startDate, block);

    expect(blockPosition('2020-01-01', block).week).toBe(1);
    expect(blockPosition('2030-01-01', block).week).toBe(weeks);
  });
});

describe('currentBlock — the one place the search lives', () => {
  it('returns the block containing today, and null outside the horizon', () => {
    // `currentPhase` and the prompt's position both need this, and each writing
    // its own `find` is a predicate that can drift — the two would disagree
    // about which block the athlete is in while both looked right.
    const blocks = trainingBlocks('2026-09-09', '2027-06-01');

    expect(currentBlock('2026-09-09', blocks)).toBe(blocks[0]);
    expect(currentBlock(blocks[2].startDate, blocks)).toBe(blocks[2]);
    expect(currentBlock('2020-01-01', blocks)).toBeNull();
    expect(currentBlock('2026-09-09', [])).toBeNull();
  });
});
