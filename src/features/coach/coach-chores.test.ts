import { describe, it, expect } from 'vitest';
import { blockRepinChoresOf, repairFor, type StaleBlockSetInput } from './coach-chores';

/**
 * `training-architecture/19` — the popup's rows, decided before the click.
 */
const stale = (raceDate: string, over: Partial<StaleBlockSetInput> = {}): StaleBlockSetInput => ({
  set: {
    athleteId: 'a1',
    raceId: 'r1',
    version: 4,
    startDate: '2026-09-14',
    blocks: [
      { name: 'Build the Volume', endDate: '2026-12-13', authoredBy: 'coach_ai' },
      { name: 'Sharpen', endDate: '2027-02-14', authoredBy: 'head_coach' },
      { name: 'Taper', endDate: '2027-03-14', authoredBy: 'coach_ai' },
    ],
  },
  athleteName: 'Sarah',
  raceName: 'Ironman Copenhagen',
  raceDate,
  ...over,
});

describe('repairFor', () => {
  const set = stale('2027-04-04').set;

  it('offers the re-pin when two or more blocks survive', () => {
    expect(repairFor(set, '2027-04-04')).toEqual({ kind: 'repin' });
    expect(repairFor(set, '2027-03-01')).toEqual({ kind: 'repin' });
  });

  it('offers the draft, naming what would go, when fewer than two survive', () => {
    expect(repairFor(set, '2027-01-01')).toEqual({ kind: 'restart', dropped: ['Sharpen', 'Taper'] });
  });

  it('offers the draft for a set the re-pin refuses on any other ground', () => {
    const poisoned = {
      ...set,
      blocks: [
        { name: 'Build', endDate: '2026-12-13', authoredBy: 'coach_ai' as const },
        { name: 'mail me at x@y.dk', endDate: '2027-03-14', authoredBy: 'coach_ai' as const },
      ],
    };
    expect(repairFor(poisoned, '2027-04-04')).toEqual({ kind: 'restart', dropped: [] });
  });
});

describe('blockRepinChoresOf', () => {
  it('makes one chore per stale set, carrying what moved, what still ends where, and the version to CAS on', () => {
    expect(blockRepinChoresOf([stale('2027-04-04')])).toEqual([
      {
        kind: 'repin-block-set',
        athleteId: 'a1',
        athleteName: 'Sarah',
        raceId: 'r1',
        raceName: 'Ironman Copenhagen',
        raceDate: '2027-04-04',
        lastBlockName: 'Taper',
        lastBlockEnd: '2027-03-14',
        version: 4,
        repair: { kind: 'repin' },
      },
    ]);
  });

  it('keeps the read’s order and decides each row on its own', () => {
    const chores = blockRepinChoresOf([
      stale('2027-01-01', { athleteName: 'Thomas' }),
      stale('2027-04-04'),
    ]);
    expect(chores.map((c) => c.athleteName)).toEqual(['Thomas', 'Sarah']);
    expect(chores[0].repair).toEqual({ kind: 'restart', dropped: ['Sharpen', 'Taper'] });
    expect(chores[1].repair).toEqual({ kind: 'repin' });
  });

  it('survives a set with no blocks — a malformed row is a chore with nothing to name, not a throw', () => {
    const [chore] = blockRepinChoresOf([stale('2027-04-04', { set: { ...stale('x').set, blocks: [] } })]);
    expect(chore.lastBlockName).toBe('');
    expect(chore.lastBlockEnd).toBe('');
    expect(chore.repair).toEqual({ kind: 'restart', dropped: [] });
  });

  it('nothing stale is no chores', () => {
    expect(blockRepinChoresOf([])).toEqual([]);
  });
});
