import { describe, it, expect, vi, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { race as raceTable, type RaceRow } from '@/db/schema';

const rows: RaceRow[] = [];

const orderBy = vi.fn(() => Promise.resolve(rows));
const selectWhere = vi.fn(() => ({ orderBy }));

const inserted: unknown[] = [];
const insertValues = vi.fn((v: unknown) => {
  inserted.push(v);
  return Promise.resolve();
});

const updates: { set: unknown; where: unknown }[] = [];
const updateWhere = vi.fn((w: unknown) => {
  updates[updates.length - 1].where = w;
  return Promise.resolve();
});
const set = vi.fn((v: unknown) => {
  updates.push({ set: v, where: null });
  return { where: updateWhere };
});

const batch = vi.fn((statements: unknown[]) => Promise.all(statements));

const deletes: unknown[] = [];
const deleteWhere = vi.fn((w: unknown) => {
  deletes.push(w);
  return Promise.resolve();
});

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: () => ({ values: insertValues }),
    update: () => ({ set }),
    delete: () => ({ where: deleteWhere }),
    batch,
  }),
}));

const {
  createRace,
  deleteRace,
  getRaces,
  getTargetRace,
  setTargetRace,
  upsertTargetRace,
  clearTargetRace,
} = await import('./race-repository');

function race(overrides: Partial<RaceRow> = {}): RaceRow {
  return {
    id: 'race_1',
    athleteId: 'athlete_1',
    name: 'Ironman Copenhagen',
    date: '2027-08-15',
    distance: 'Full',
    isTarget: true,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  rows.length = 0;
  inserted.length = 0;
  updates.length = 0;
  deletes.length = 0;
  batch.mockClear();
});

describe('a Race is a record of its own', () => {
  it('is created with a name, a date and a distance', async () => {
    await createRace('athlete_1', {
      name: 'Ironman Copenhagen',
      date: '2027-08-15',
      distance: 'Full',
    });

    expect(inserted[0]).toMatchObject({
      athleteId: 'athlete_1',
      name: 'Ironman Copenhagen',
      date: '2027-08-15',
      distance: 'Full',
    });
  });

  it('reads back what an athlete has', async () => {
    rows.push(race(), race({ id: 'race_2', name: 'Kalmar', isTarget: false }));
    expect((await getRaces('athlete_1')).map((r) => r.name)).toEqual([
      'Ironman Copenhagen',
      'Kalmar',
    ]);
  });

  it('lets an athlete have none at all', async () => {
    // Zero races is a real, expected state, not an error: "ready to start the
    // next block" is as valid a goal as a start line.
    expect(await getRaces('athlete_1')).toEqual([]);
    expect(await getTargetRace('athlete_1')).toBeNull();
  });
});

describe('the Target Race is one of them, and it rotates', () => {
  it('is the athlete race flagged as the target', async () => {
    rows.push(race({ id: 'race_2', name: 'Kalmar' }));
    expect((await getTargetRace('athlete_1'))?.name).toBe('Kalmar');
  });

  it('asks the database for the flagged race, not merely for the athlete', () => {
    // The filter is the whole query — the mocked driver returns whatever it is
    // given, so a `where` that dropped `is_target` would still pass the test
    // above while returning a race the athlete is not pointed at. Comparing
    // against the clause drizzle itself builds is what makes that observable.
    expect(selectWhere).toHaveBeenCalledWith(
      and(eq(raceTable.athleteId, 'athlete_1'), eq(raceTable.isTarget, true)),
    );
  });

  it('moves the flag rather than adding a second one', async () => {
    // Being the target is a property that rotates as races pass, not a
    // permanent one. Clearing and setting go in a single `db.batch` — the
    // partial unique index allows one target per athlete, so two separate round
    // trips could land the set before the clear and be rejected by the database.
    await setTargetRace('athlete_1', 'race_2');

    expect(batch).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(2);
    expect(updates[0].set).toEqual({ isTarget: false });
    expect(updates[1].set).toEqual({ isTarget: true });
  });
});

describe('editing the Target Race after onboarding', () => {
  it('updates the race the athlete already has, rather than adding another', async () => {
    rows.push(race({ id: 'race_1' }));

    await upsertTargetRace('athlete_1', {
      name: 'Ironman Kalmar',
      date: '2028-08-19',
      distance: 'Full',
    });

    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toEqual({
      name: 'Ironman Kalmar',
      date: '2028-08-19',
      distance: 'Full',
    });
  });

  it('creates one when the athlete has no Target Race yet', async () => {
    // An athlete who onboarded with "no race yet" and has since booked one.
    await upsertTargetRace('athlete_1', {
      name: 'Ironman Kalmar',
      date: '2028-08-19',
      distance: 'Full',
    });

    expect(updates).toHaveLength(0);
    expect(inserted[0]).toMatchObject({
      athleteId: 'athlete_1',
      name: 'Ironman Kalmar',
      isTarget: true,
    });
  });

  it('clears the target without deleting the races themselves', async () => {
    // A race that has been run is a record, and slice 09 reads them. Only the
    // pointer is cleared, which is what "between races" actually means.
    await clearTargetRace('athlete_1');

    expect(updates).toHaveLength(1);
    expect(updates[0].set).toEqual({ isTarget: false });
  });
});

describe('what a Race is created as by default', () => {
  it('is the Target Race unless told otherwise', async () => {
    await createRace('athlete_1', {
      name: 'Ironman Copenhagen',
      date: '2027-08-15',
      distance: 'Full',
    });
    expect(inserted[0]).toMatchObject({ isTarget: true });
  });

  it('is not the target when added alongside an existing one (slice 09)', async () => {
    await createRace(
      'athlete_1',
      { name: 'Kalmar', date: '2028-08-19', distance: 'Full' },
      { asTarget: false },
    );
    expect(inserted[0]).toMatchObject({ isTarget: false });
  });
});

describe('removing a Race (slice 09)', () => {
  it('deletes only the acting athlete’s race — the athlete id is in the WHERE, not just the race id', async () => {
    // A race id alone would let anyone holding one delete another athlete's
    // record (ADR 0006). Asserted against the clause drizzle builds, the same
    // way the target read is.
    await deleteRace('athlete_1', 'race_2');

    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toEqual(and(eq(raceTable.athleteId, 'athlete_1'), eq(raceTable.id, 'race_2')));
  });
});
