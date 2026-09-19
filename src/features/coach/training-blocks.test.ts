import { describe, it, expect } from 'vitest';
import { addDays } from '@/lib/date';
import {
  fitsRace,
  isStaleSet,
  staleLastBlockOf,
  repinBlockSet,
  applyBlockEdit,
  blockPosition,
  currentBlock,
  currentPhase,
  expandBlockSet,
  resolveBlocks,
  trainingBlocks,
  validateBlockSet,
  type StoredBlockSet,
  holdsHeadCoachBlock,
  type TrainingBlockSpec,
} from './training-blocks';

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

/**
 * `training-architecture/07` — the stored, adjusted set.
 *
 * Stage 2 stores what the Coach decided; these pin the shape a stored set must
 * have to be trusted and how a stored set replaces the arithmetic on read.
 */
describe('validateBlockSet — what a stored set must look like', () => {
  const START = '2026-09-14';
  const RACE = '2027-03-14'; // 26 weeks out

  const good: TrainingBlockSpec[] = [
    { name: 'Build the Volume', endDate: '2026-11-15', authoredBy: 'coach_ai' },
    { name: 'Sharpen the Bike', endDate: '2027-01-17', authoredBy: 'coach_ai' },
    { name: 'Race Specific', endDate: '2027-02-28', authoredBy: 'coach_ai' },
    { name: 'Taper', endDate: RACE, authoredBy: 'coach_ai' },
  ];

  it('accepts two to six blocks with increasing ends, ≥ 7 days each, ending on race day', () => {
    expect(validateBlockSet(good, START, RACE)).toEqual({ ok: true });
    expect(
      validateBlockSet(
        [
          { name: 'Base', endDate: '2026-12-31', authoredBy: 'coach_ai' },
          { name: 'Race Specific', endDate: RACE, authoredBy: 'coach_ai' },
        ],
        START,
        RACE,
      ),
    ).toEqual({ ok: true });
  });

  it('rejects fewer than two or more than six blocks', () => {
    expect(validateBlockSet([good[3]], START, RACE)).toEqual({ ok: false, reason: 'count' });
    const seven = Array.from({ length: 7 }, (_, i) => ({
      name: `Purpose ${'abcdefg'[i]}`,
      endDate: i === 6 ? RACE : addDays(START, 14 * (i + 1)),
      authoredBy: 'coach_ai' as const,
    }));
    expect(validateBlockSet(seven, START, RACE)).toEqual({ ok: false, reason: 'count' });
  });

  it('rejects a set whose last block does not end on race day', () => {
    const drifted = [...good.slice(0, 3), { ...good[3], endDate: '2027-03-13' }];
    expect(validateBlockSet(drifted, START, RACE)).toEqual({ ok: false, reason: 'end' });
  });

  it('rejects ends that do not strictly increase', () => {
    const swapped = [good[0], { ...good[1], endDate: '2026-11-15' }, good[2], good[3]];
    expect(validateBlockSet(swapped, START, RACE)).toEqual({ ok: false, reason: 'order' });
  });

  it('rejects a block shorter than seven days', () => {
    const short = [good[0], { ...good[1], endDate: '2026-11-20' }, good[2], good[3]];
    expect(validateBlockSet(short, START, RACE)).toEqual({ ok: false, reason: 'short' });
  });

  it('rejects an empty, blank or over-long name', () => {
    for (const name of ['', '   ', 'x'.repeat(41)]) {
      const bad = [{ ...good[0], name }, ...good.slice(1)];
      expect(validateBlockSet(bad, START, RACE)).toEqual({ ok: false, reason: 'name' });
    }
  });

  it('rejects a positional name — the arithmetic pretending to be coaching', () => {
    for (const name of ['Block 2', 'block 2 of 4', 'Phase 3', 'Fase 1', 'PHASE1', 'Blok 2']) {
      const bad = [{ ...good[0], name }, ...good.slice(1)];
      expect(validateBlockSet(bad, START, RACE)).toEqual({ ok: false, reason: 'positional' });
    }
  });

  it('rejects a name carrying an email or phone shape — it would reach the prompt as the phase', () => {
    for (const name of ['Camp with lars@example.com', 'Call +45 12 34 56 78']) {
      const bad = [{ ...good[0], name }, ...good.slice(1)];
      expect(validateBlockSet(bad, START, RACE)).toEqual({ ok: false, reason: 'identifier' });
    }
  });

  it('rejects an end date that is not a calendar date', () => {
    const bad = [{ ...good[0], endDate: 'soon' }, ...good.slice(1)];
    expect(validateBlockSet(bad, START, RACE)).toEqual({ ok: false, reason: 'date' });
  });
});

describe('resolveBlocks — the stored set replaces the arithmetic, when it still fits', () => {
  const TODAY = '2026-10-01';
  const RACE = { date: '2027-03-14' };
  const stored: StoredBlockSet = {
    startDate: '2026-09-14',
    blocks: [
      { name: 'Build the Volume', endDate: '2026-11-15', authoredBy: 'coach_ai' },
      { name: 'Sharpen the Bike', endDate: '2027-01-17', authoredBy: 'head_coach' },
      { name: 'Taper', endDate: '2027-03-14', authoredBy: 'coach_ai' },
    ],
  };

  it('expands a stored set contiguously, carrying each author', () => {
    const blocks = resolveBlocks(TODAY, RACE, stored);
    expect(blocks.map((b) => [b.index, b.total, b.name, b.startDate, b.endDate, b.authoredBy])).toEqual([
      [1, 3, 'Build the Volume', '2026-09-14', '2026-11-15', 'coach_ai'],
      [2, 3, 'Sharpen the Bike', '2026-11-16', '2027-01-17', 'head_coach'],
      [3, 3, 'Taper', '2027-01-18', '2027-03-14', 'coach_ai'],
    ]);
  });

  it('falls back to the arithmetic draft when nothing is stored', () => {
    const blocks = resolveBlocks(TODAY, RACE, null);
    expect(blocks).toEqual(trainingBlocks(TODAY, RACE.date));
    expect(blocks.every((b) => b.authoredBy === 'arithmetic')).toBe(true);
  });

  it('ignores a stored set whose last end is not the race date — a moved race invalidates it', () => {
    const blocks = resolveBlocks(TODAY, { date: '2027-04-01' }, stored);
    expect(blocks).toEqual(trainingBlocks(TODAY, '2027-04-01'));
  });

  it('returns no blocks for an athlete with no race, stored set or not', () => {
    expect(resolveBlocks(TODAY, null, stored)).toEqual([]);
    expect(resolveBlocks(TODAY, null, null)).toEqual([]);
  });

  it('yields the same boundaries on two different days — stored blocks do not drift', () => {
    const monday = resolveBlocks('2026-10-05', RACE, stored);
    const friday = resolveBlocks('2026-10-09', RACE, stored);
    expect(friday).toEqual(monday);
    // Where the arithmetic would have moved: the draft is measured from today.
    expect(trainingBlocks('2026-10-09', RACE.date)).not.toEqual(trainingBlocks('2026-10-05', RACE.date));
  });
});

describe('trainingBlocks — the count table at its boundaries', () => {
  const TODAY = '2026-09-14';
  const weeksOut = (w: number) => addDays(TODAY, w * 7);

  it('steps up exactly at 8, 16, 28 and 44 weeks', () => {
    // The table is a plain monotone step function, so each threshold is pinned
    // on both sides: one day short of it stays on the lower count.
    expect(trainingBlocks(TODAY, addDays(weeksOut(8), -1)).length).toBe(2);
    expect(trainingBlocks(TODAY, weeksOut(8)).length).toBe(3);
    expect(trainingBlocks(TODAY, addDays(weeksOut(16), -1)).length).toBe(3);
    expect(trainingBlocks(TODAY, weeksOut(16)).length).toBe(4);
    expect(trainingBlocks(TODAY, addDays(weeksOut(28), -1)).length).toBe(4);
    expect(trainingBlocks(TODAY, weeksOut(28)).length).toBe(5);
    expect(trainingBlocks(TODAY, addDays(weeksOut(44), -1)).length).toBe(5);
    expect(trainingBlocks(TODAY, weeksOut(44)).length).toBe(6);
  });

  it('gives no blocks for a race today or in the past, and blocks for a race tomorrow', () => {
    expect(trainingBlocks(TODAY, TODAY)).toEqual([]);
    expect(trainingBlocks(TODAY, addDays(TODAY, -1))).toEqual([]);
    expect(trainingBlocks(TODAY, addDays(TODAY, 1)).length).toBe(2);
  });
});

describe('validateBlockSet — the edges of each rule', () => {
  const START = '2026-09-14';
  const RACE = '2027-03-14';
  const set = (first: Partial<TrainingBlockSpec>): TrainingBlockSpec[] => [
    { name: 'Build the Volume', endDate: '2026-12-13', authoredBy: 'coach_ai', ...first },
    { name: 'Taper', endDate: RACE, authoredBy: 'coach_ai' },
  ];

  it('accepts a name of exactly forty characters and one that only needs trimming', () => {
    expect(validateBlockSet(set({ name: 'x'.repeat(40) }), START, RACE)).toEqual({ ok: true });
    expect(validateBlockSet(set({ name: '  Build  ' }), START, RACE)).toEqual({ ok: true });
  });

  it('accepts a first block of exactly seven days and refuses six', () => {
    // Inclusive span: start and end both count, so six days after the start is
    // the seventh day.
    expect(validateBlockSet(set({ endDate: addDays(START, 6) }), START, RACE)).toEqual({ ok: true });
    expect(validateBlockSet(set({ endDate: addDays(START, 5) }), START, RACE)).toEqual({
      ok: false,
      reason: 'short',
    });
  });

  it('accepts exactly six blocks', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      name: `Purpose ${'abcdef'[i]}`,
      endDate: i === 5 ? RACE : addDays(START, 20 * (i + 1)),
      authoredBy: 'coach_ai' as const,
    }));
    expect(validateBlockSet(six, START, RACE)).toEqual({ ok: true });
  });

  it('lets a purpose-shaped name mention a number, and only refuses the positional shape', () => {
    expect(validateBlockSet(set({ name: '2 x 20 Threshold' }), START, RACE)).toEqual({ ok: true });
    expect(validateBlockSet(set({ name: 'Blockbuster Week' }), START, RACE)).toEqual({ ok: true });
    expect(validateBlockSet(set({ name: 'block2' }), START, RACE)).toEqual({ ok: false, reason: 'positional' });
    expect(validateBlockSet(set({ name: 'Block  3 of 4' }), START, RACE)).toEqual({ ok: false, reason: 'positional' });
    expect(validateBlockSet(set({ name: 'Before Block 2' }), START, RACE)).toEqual({ ok: true });
    expect(validateBlockSet(set({ name: 'Block two' }), START, RACE)).toEqual({ ok: true });
  });

  it('lets an arithmetic block keep its positional name — only a named block must be named', () => {
    // A Head Coach renaming one block of a materialised draft leaves the rest
    // as the formula made them (slice 08); that set is valid.
    expect(validateBlockSet(set({ name: 'Block 1 of 2', authoredBy: 'arithmetic' }), START, RACE)).toEqual({ ok: true });
    expect(validateBlockSet(set({ name: 'Block 1 of 2', authoredBy: 'head_coach' }), START, RACE)).toEqual({
      ok: false,
      reason: 'positional',
    });
  });
});

describe('resolveBlocks — an empty stored set', () => {
  it('falls through to the arithmetic rather than throwing', () => {
    const blocks = resolveBlocks('2026-10-01', { date: '2027-03-14' }, { startDate: '2026-09-14', blocks: [] });
    expect(blocks).toEqual(trainingBlocks('2026-10-01', '2027-03-14'));
  });
});

/**
 * `training-architecture/08` — the Head Coach's rename and re-boundary, as a
 * pure function over the stored set.
 */
describe('applyBlockEdit — rename and re-boundary, nothing more', () => {
  const RACE = '2027-03-14';
  const set: StoredBlockSet = {
    startDate: '2026-09-14',
    blocks: [
      { name: 'Build the Volume', endDate: '2026-11-15', authoredBy: 'coach_ai' },
      { name: 'Sharpen the Bike', endDate: '2027-01-17', authoredBy: 'coach_ai' },
      { name: 'Taper', endDate: RACE, authoredBy: 'arithmetic' },
    ],
  };

  it('renames a block and marks it head_coach; every other author is untouched', () => {
    const result = applyBlockEdit(set, 2, { name: '  Long Rides ' }, RACE);
    expect(result).toEqual({
      ok: true,
      blocks: [
        set.blocks[0],
        { name: 'Long Rides', endDate: '2027-01-17', authoredBy: 'head_coach' },
        set.blocks[2],
      ],
    });
  });

  it('moves a middle block’s end, and the next block’s start follows when expanded', () => {
    const result = applyBlockEdit(set, 1, { endDate: '2026-12-06' }, RACE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks[0]).toEqual({ name: 'Build the Volume', endDate: '2026-12-06', authoredBy: 'head_coach' });
    const expanded = expandBlockSet({ ...set, blocks: result.blocks });
    expect(expanded[1].startDate).toBe('2026-12-07');
    expect(expanded[1].endDate).toBe('2027-01-17');
  });

  it('renames and re-bounds in one edit', () => {
    const result = applyBlockEdit(set, 1, { name: 'Base', endDate: '2026-12-06' }, RACE);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.blocks[0]).toEqual({ name: 'Base', endDate: '2026-12-06', authoredBy: 'head_coach' });
  });

  it('refuses an end date not strictly between the neighbours’ ends', () => {
    // On the previous end, on the next end, before the previous, after the next.
    expect(applyBlockEdit(set, 2, { endDate: '2026-11-15' }, RACE)).toEqual({ ok: false, reason: 'boundary' });
    expect(applyBlockEdit(set, 2, { endDate: RACE }, RACE)).toEqual({ ok: false, reason: 'boundary' });
    expect(applyBlockEdit(set, 2, { endDate: '2026-10-01' }, RACE)).toEqual({ ok: false, reason: 'boundary' });
    expect(applyBlockEdit(set, 1, { endDate: '2027-02-01' }, RACE)).toEqual({ ok: false, reason: 'boundary' });
    // The first block's floor is the set's own start: the day before is out of
    // order; the start day itself is in order but one day long, so too short.
    expect(applyBlockEdit(set, 1, { endDate: '2026-09-13' }, RACE)).toEqual({ ok: false, reason: 'boundary' });
    expect(applyBlockEdit(set, 1, { endDate: '2026-09-14' }, RACE)).toEqual({ ok: false, reason: 'short' });
  });

  it('refuses any end-date change on the last block — it is race day', () => {
    expect(applyBlockEdit(set, 3, { endDate: '2027-03-07' }, RACE)).toEqual({ ok: false, reason: 'last-block-end' });
    // Renaming the last block is fine.
    expect(applyBlockEdit(set, 3, { name: 'Race Week' }, RACE)).toMatchObject({ ok: true });
  });

  it('hands the validator’s refusal through — a block squeezed under seven days, a positional name', () => {
    expect(applyBlockEdit(set, 1, { endDate: '2026-09-18' }, RACE)).toEqual({ ok: false, reason: 'short' });
    expect(applyBlockEdit(set, 1, { endDate: '2027-01-12' }, RACE)).toEqual({ ok: false, reason: 'short' });
    expect(applyBlockEdit(set, 1, { name: 'Block 1' }, RACE)).toEqual({ ok: false, reason: 'positional' });
    expect(applyBlockEdit(set, 1, { name: '' }, RACE)).toEqual({ ok: false, reason: 'name' });
  });

  it('refuses a position that does not exist, an edit that changes nothing, and a non-date', () => {
    expect(applyBlockEdit(set, 0, { name: 'X' }, RACE)).toEqual({ ok: false, reason: 'position' });
    expect(applyBlockEdit(set, 4, { name: 'X' }, RACE)).toEqual({ ok: false, reason: 'position' });
    expect(applyBlockEdit(set, 1, {}, RACE)).toEqual({ ok: false, reason: 'nothing' });
    expect(applyBlockEdit(set, 1, { endDate: 'soon' }, RACE)).toEqual({ ok: false, reason: 'date' });
  });

  it('refuses an edit that changes nothing, so authorship is never stamped for free', () => {
    expect(applyBlockEdit(set, 2, { name: 'Sharpen the Bike' }, RACE)).toEqual({ ok: false, reason: 'nothing' });
    expect(applyBlockEdit(set, 2, { name: '  Sharpen the Bike ' }, RACE)).toEqual({ ok: false, reason: 'nothing' });
    expect(applyBlockEdit(set, 2, { endDate: '2027-01-17' }, RACE)).toEqual({ ok: false, reason: 'nothing' });
    expect(applyBlockEdit(set, 2, { name: 'Sharpen the Bike', endDate: '2027-01-17' }, RACE)).toEqual({
      ok: false,
      reason: 'nothing',
    });
  });

  it('cannot add or remove a block — the count is always the count it was given', () => {
    const result = applyBlockEdit(set, 2, { name: 'Long Rides' }, RACE);
    if (result.ok) expect(result.blocks).toHaveLength(set.blocks.length);
  });
});

describe('an athlete with no Head Coach is untouched by slice 08', () => {
  it('resolves to exactly the arithmetic draft, with no head_coach author anywhere', () => {
    // 08 adds a write path only a linked Head Coach can reach. With no link
    // nothing in it runs, so the resolved blocks are what 07 left: the stored
    // set or the draft, and never a `head_coach` block. Pinned as a snapshot so
    // a later change to the resolver has to say it meant to move this.
    const blocks = resolveBlocks('2026-09-14', { date: '2027-03-14' }, null);
    expect(blocks.some((b) => b.authoredBy === 'head_coach')).toBe(false);
    expect(blocks).toMatchSnapshot();
  });
});

describe('fitsRace — the one test of whether a stored set still describes the race', () => {
  const set = {
    startDate: '2026-09-01',
    blocks: [
      { name: 'Build', endDate: '2027-01-10', authoredBy: 'coach_ai' as const },
      { name: 'Taper', endDate: '2027-08-15', authoredBy: 'coach_ai' as const },
    ],
  };

  it('fits when the last block ends on race day, and not otherwise', () => {
    expect(fitsRace(set, '2027-08-15')).toBe(true);
    expect(fitsRace(set, '2027-08-29')).toBe(false);
  });

  it('an empty set fits no race', () => {
    expect(fitsRace({ startDate: '2026-09-01', blocks: [] }, '2027-08-15')).toBe(false);
  });

  it('isStaleSet: nothing stored is not stale; a stored set that misses race day is', () => {
    expect(isStaleSet(null, '2027-08-15')).toBe(false);
    expect(isStaleSet(set, '2027-08-15')).toBe(false);
    expect(isStaleSet(set, '2027-08-29')).toBe(true);
  });

  it('staleLastBlockOf: the last block of a stale set, by name and end; null when it fits, is empty, or is absent', () => {
    expect(staleLastBlockOf(set, '2027-08-29')).toEqual({ lastBlockName: 'Taper', endsOn: '2027-08-15' });
    expect(staleLastBlockOf(set, '2027-08-15')).toBeNull();
    expect(staleLastBlockOf(null, '2027-08-29')).toBeNull();
    expect(staleLastBlockOf({ startDate: '2026-09-01', blocks: [] }, '2027-08-29')).toBeNull();
  });
});

describe('holdsHeadCoachBlock', () => {
  it('is true when any block in the set was a human\'s, false for a set the Coach alone drafted', () => {
    const coach = { startDate: '2027-01-04', blocks: [{ name: 'Base', endDate: '2027-02-28', authoredBy: 'coach_ai' as const }] };
    expect(holdsHeadCoachBlock(coach)).toBe(false);
    expect(
      holdsHeadCoachBlock({ ...coach, blocks: [...coach.blocks, { name: 'Taper', endDate: '2027-03-14', authoredBy: 'head_coach' as const }] }),
    ).toBe(true);
    expect(holdsHeadCoachBlock({ ...coach, blocks: [] })).toBe(false);
  });
});

describe('repinBlockSet — the Head Coach re-pins a stale set to a moved race (training-architecture/19)', () => {
  const START = '2026-09-14';
  const set = {
    startDate: START,
    blocks: [
      { name: 'Build the Volume', endDate: '2026-12-13', authoredBy: 'coach_ai' as const },
      { name: 'Sharpen', endDate: '2027-02-14', authoredBy: 'head_coach' as const },
      { name: 'Taper', endDate: '2027-03-14', authoredBy: 'coach_ai' as const },
    ],
  };

  it('a race moved later extends the last block to the new day and drops nothing', () => {
    expect(repinBlockSet(set, '2027-04-04')).toEqual({
      ok: true,
      blocks: [set.blocks[0], set.blocks[1], { ...set.blocks[2], endDate: '2027-04-04' }],
      dropped: [],
    });
  });

  it('a race moved earlier drops every block ending on or after the new day, then re-pins the last survivor', () => {
    expect(repinBlockSet(set, '2027-03-01')).toEqual({
      ok: true,
      blocks: [set.blocks[0], { ...set.blocks[1], endDate: '2027-03-01' }],
      dropped: ['Taper'],
    });
  });

  it('a block ending exactly on the new race day survives as the last block — it already fits', () => {
    // The ticket's draft said "on or after"; a block ending on race day is what
    // `fitsRace` calls the last block, so dropping it would throw away a block
    // that needed no repair. "Sharpen" stays, and two survivors is enough.
    expect(repinBlockSet(set, '2027-02-14')).toEqual({
      ok: true,
      blocks: [set.blocks[0], set.blocks[1]],
      dropped: ['Taper'],
    });
  });

  it('the re-pinned survivor keeps its author: pinning to race day is the rule, not a judgement', () => {
    const earlier = repinBlockSet(set, '2027-03-01');
    expect(earlier.ok && earlier.blocks[1].authoredBy).toBe('head_coach');
    const later = repinBlockSet(set, '2027-04-04');
    expect(later.ok && later.blocks[2].authoredBy).toBe('coach_ai');
  });

  it('fewer than two survivors is too-few-blocks, naming what would have gone', () => {
    expect(repinBlockSet(set, '2027-01-01')).toEqual({
      ok: false,
      reason: 'too-few-blocks',
      dropped: ['Sharpen', 'Taper'],
    });
    // Before the set even starts: nothing survives.
    expect(repinBlockSet(set, '2026-01-01')).toEqual({
      ok: false,
      reason: 'too-few-blocks',
      dropped: ['Build the Volume', 'Sharpen', 'Taper'],
    });
  });

  it('one survivor is too few even when the race moved only just past the first block', () => {
    expect(repinBlockSet(set, '2026-12-20')).toEqual({
      ok: false,
      reason: 'too-few-blocks',
      dropped: ['Sharpen', 'Taper'],
    });
  });

  it('a set that already fits is returned unchanged', () => {
    expect(repinBlockSet(set, '2027-03-14')).toEqual({ ok: true, blocks: set.blocks, dropped: [] });
  });

  it('runs the set validator on the result', () => {
    // A stored name that has since become refusable — an identifier shape —
    // is caught on the way out rather than written back.
    const poisoned = {
      startDate: START,
      blocks: [
        { name: 'Build', endDate: '2026-12-13', authoredBy: 'coach_ai' as const },
        { name: 'mail me at x@y.dk', endDate: '2027-03-14', authoredBy: 'coach_ai' as const },
      ],
    };
    expect(repinBlockSet(poisoned, '2027-04-04')).toEqual({ ok: false, reason: 'identifier', dropped: [] });
  });
});
