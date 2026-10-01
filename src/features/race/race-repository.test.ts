import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { athlete as athleteTable, events as eventsTable, race as raceTable } from '@/db/schema';
import { createTestDatabase, seedAthlete, type TestDatabase } from '@/test/pglite';

/**
 * Races against a real Postgres (`src/test/pglite.ts`, `code-health/30`): each
 * test writes through the repository and reads the rows back, so what is
 * asserted is what a caller would find stored — never which statements were
 * issued to get there. The partial unique index that allows one Target Race per
 * athlete is the migrated one, enforced as Postgres enforces it.
 */

let testDb: TestDatabase;
vi.mock('@/db', () => ({ getDb: () => testDb.db }));

const {
  createRace,
  deleteRace,
  getRaces,
  getTargetRace,
  setTargetRace,
  upsertTargetRace,
  clearTargetRace,
  replacePastRaces,
  getPastRaces,
  addPastRace,
  deletePastRace,
  addRace,
} = await import('./race-repository');

// Booting and migrating is seconds; the default five would fail on a cold start.
beforeAll(async () => {
  testDb = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await testDb.reset();
});

const anAthlete = (tag: string) => seedAthlete(testDb.db, tag);

const COPENHAGEN = { name: 'Ironman Copenhagen', date: '2027-08-15', distance: 'Full' as const };
const KALMAR = { name: 'Ironman Kalmar', date: '2028-08-19', distance: 'Full' as const };
const ODENSE = { name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic' as const };

/** What is stored for an athlete, in the shape a reader cares about. */
async function stored(athleteId: string) {
  return (await getRaces(athleteId)).map((r) => ({
    name: r.name,
    date: r.date,
    distance: r.distance,
    isTarget: r.isTarget,
  }));
}

describe('a Race is a record of its own', () => {
  it('is stored with its name, date and distance, and the id that comes back is the stored row', async () => {
    const athleteId = await anAthlete('a');

    const id = await createRace(athleteId, COPENHAGEN);

    const [row] = await getRaces(athleteId);
    expect(row.id).toBe(id);
    expect(row).toMatchObject({ athleteId, ...COPENHAGEN });
  });

  it('reads back every race the athlete has, earliest first', async () => {
    const athleteId = await anAthlete('a');
    await createRace(athleteId, KALMAR, { asTarget: false });
    await createRace(athleteId, COPENHAGEN);
    await createRace(athleteId, ODENSE, { asTarget: false });

    expect((await getRaces(athleteId)).map((r) => r.name)).toEqual([
      'Olympic Odense',
      'Ironman Copenhagen',
      'Ironman Kalmar',
    ]);
  });

  it('reads only the asking athlete’s races', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    await createRace(theirs, COPENHAGEN);

    expect(await getRaces(mine)).toEqual([]);
  });

  it('lets an athlete have none at all', async () => {
    // Zero races is a real, expected state, not an error: "ready to start the
    // next block" is as valid a goal as a start line.
    const athleteId = await anAthlete('a');
    expect(await getRaces(athleteId)).toEqual([]);
    expect(await getTargetRace(athleteId)).toBeNull();
  });
});

describe('what a Race is created as by default', () => {
  it('is the Target Race unless told otherwise', async () => {
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);
    expect((await getTargetRace(athleteId))?.name).toBe('Ironman Copenhagen');
  });

  it('is not the target when added alongside an existing one (slice 09)', async () => {
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);
    await createRace(athleteId, KALMAR, { asTarget: false });

    expect(await stored(athleteId)).toEqual([
      { ...COPENHAGEN, isTarget: true },
      { ...KALMAR, isTarget: false },
    ]);
  });

  it('cannot be a second target: the database holds one per athlete', async () => {
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);

    await expect(createRace(athleteId, KALMAR)).rejects.toThrow();
    expect(await stored(athleteId)).toEqual([{ ...COPENHAGEN, isTarget: true }]);
  });
});

describe('the Target Race is one of them, and it rotates', () => {
  it('is the race flagged as the target, not merely the athlete’s first', async () => {
    const athleteId = await anAthlete('a');
    await createRace(athleteId, ODENSE, { asTarget: false });
    await createRace(athleteId, KALMAR);

    expect((await getTargetRace(athleteId))?.name).toBe('Ironman Kalmar');
  });

  it('is the asking athlete’s own target', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    await createRace(theirs, COPENHAGEN);

    expect(await getTargetRace(mine)).toBeNull();
  });

  it('moves the flag rather than adding a second one', async () => {
    // Clear and set go in one batch: the partial unique index allows one target
    // per athlete, so a set landing before the clear would be refused.
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);
    const kalmar = await createRace(athleteId, KALMAR, { asTarget: false });

    await setTargetRace(athleteId, kalmar);

    expect(await stored(athleteId)).toEqual([
      { ...COPENHAGEN, isTarget: false },
      { ...KALMAR, isTarget: true },
    ]);
  });

  it('leaves another athlete’s target where it was', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    const myKalmar = await createRace(mine, KALMAR, { asTarget: false });
    await createRace(theirs, COPENHAGEN);

    await setTargetRace(mine, myKalmar);

    expect((await getTargetRace(theirs))?.name).toBe('Ironman Copenhagen');
  });

  it('cannot point one athlete at another athlete’s race', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    await createRace(mine, COPENHAGEN);
    const theirKalmar = await createRace(theirs, KALMAR, { asTarget: false });

    await setTargetRace(mine, theirKalmar);

    expect(await getTargetRace(theirs)).toBeNull();
    expect(await getTargetRace(mine)).toBeNull();
  });
});

describe('editing the Target Race after onboarding', () => {
  it('updates the race the athlete already has, rather than adding another', async () => {
    const athleteId = await anAthlete('a');
    const id = await createRace(athleteId, COPENHAGEN);

    await upsertTargetRace(athleteId, KALMAR);

    const races = await getRaces(athleteId);
    expect(races).toHaveLength(1);
    expect(races[0]).toMatchObject({ id, ...KALMAR, isTarget: true });
  });

  it('edits only the target, not a race beside it', async () => {
    const athleteId = await anAthlete('a');
    await createRace(athleteId, ODENSE, { asTarget: false });
    await createRace(athleteId, COPENHAGEN);

    await upsertTargetRace(athleteId, KALMAR);

    expect(await stored(athleteId)).toEqual([
      { ...ODENSE, isTarget: false },
      { ...KALMAR, isTarget: true },
    ]);
  });

  it('creates one, as the target, when the athlete has no Target Race yet', async () => {
    // An athlete who onboarded with "no race yet" and has since booked one.
    const athleteId = await anAthlete('a');

    await upsertTargetRace(athleteId, KALMAR);

    expect(await stored(athleteId)).toEqual([{ ...KALMAR, isTarget: true }]);
  });

  it('clears the target without deleting the races themselves', async () => {
    // A race that has been run is a record, and slice 09 reads them. Only the
    // pointer is cleared, which is what "between races" actually means.
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);

    await clearTargetRace(athleteId);

    expect(await stored(athleteId)).toEqual([{ ...COPENHAGEN, isTarget: false }]);
    expect(await getTargetRace(athleteId)).toBeNull();
  });

  it('clears only the asking athlete’s target', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    await createRace(mine, COPENHAGEN);
    await createRace(theirs, KALMAR);

    await clearTargetRace(mine);

    expect((await getTargetRace(theirs))?.name).toBe('Ironman Kalmar');
  });
});

describe('removing a Race (slice 09)', () => {
  it('deletes the athlete’s race and keeps the rest', async () => {
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);
    const kalmar = await createRace(athleteId, KALMAR, { asTarget: false });

    await deleteRace(athleteId, kalmar);

    expect(await stored(athleteId)).toEqual([{ ...COPENHAGEN, isTarget: true }]);
  });

  it('a race id alone deletes nothing that is not the caller’s (ADR 0006)', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    const theirRace = await createRace(theirs, COPENHAGEN);

    await deleteRace(mine, theirRace);

    expect(await getRaces(theirs)).toHaveLength(1);
  });
});

describe('the batch the target rotation relies on', () => {
  it('a batch whose second statement fails leaves the first unwritten', async () => {
    // What makes `setTargetRace` safe is that neon-http runs a batch as one
    // transaction. The in-process stand-in must do the same, or the tests above
    // would pass against a batch that half-applies.
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);
    const db = testDb.db;

    await expect(
      db.batch([
        db.update(raceTable).set({ isTarget: false }),
        db.insert(raceTable).values({ athleteId: 'not-a-uuid', ...KALMAR }),
      ]),
    ).rejects.toThrow();

    expect(await stored(athleteId)).toEqual([{ ...COPENHAGEN, isTarget: true }]);
  });
});

describe('past races — the races the athlete has finished (training-architecture/35)', () => {
  const HALF = { distance: 'Half' as const, date: '2025-08-16', finishSeconds: null, note: null };
  const OLYMPIC = { distance: 'Olympic' as const, date: '2024-06-01', finishSeconds: 9000, note: 'first' };

  const pastOf = async (athleteId: string) =>
    (await getPastRaces(athleteId)).map((r) => ({
      distance: r.distance,
      date: r.date,
      finishSeconds: r.finishSeconds,
      note: r.note,
    }));

  it('replacePastRaces stores the list, earliest first', async () => {
    const athleteId = await anAthlete('a');

    await replacePastRaces(athleteId, [HALF, OLYMPIC]);

    expect(await pastOf(athleteId)).toEqual([OLYMPIC, HALF]);
  });

  it('replacePastRaces replaces rather than appends, so a re-run cannot double the list', async () => {
    const athleteId = await anAthlete('a');
    await replacePastRaces(athleteId, [HALF, OLYMPIC]);

    await replacePastRaces(athleteId, [HALF]);

    expect(await pastOf(athleteId)).toEqual([HALF]);
  });

  it('replacePastRaces with no rows empties the list', async () => {
    const athleteId = await anAthlete('a');
    await replacePastRaces(athleteId, [HALF]);

    await replacePastRaces(athleteId, []);

    expect(await getPastRaces(athleteId)).toEqual([]);
  });

  it('replacePastRaces touches only the athlete it is given', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    await replacePastRaces(theirs, [HALF]);

    await replacePastRaces(mine, []);
    await replacePastRaces(mine, [OLYMPIC]);

    expect(await pastOf(theirs)).toEqual([HALF]);
  });

  it('a replace that fails keeps the list it would have cleared', async () => {
    const athleteId = await anAthlete('a');
    await replacePastRaces(athleteId, [HALF]);

    await expect(
      replacePastRaces(athleteId, [{ ...OLYMPIC, date: 'not a date' }]),
    ).rejects.toThrow();

    expect(await pastOf(athleteId)).toEqual([HALF]);
  });

  it('addPastRace stores one more and answers with its id; deletePastRace removes it', async () => {
    const athleteId = await anAthlete('a');
    await addPastRace(athleteId, HALF);

    const id = await addPastRace(athleteId, OLYMPIC);
    expect((await getPastRaces(athleteId)).find((r) => r.id === id)).toMatchObject(OLYMPIC);

    await deletePastRace(athleteId, id);
    expect(await pastOf(athleteId)).toEqual([HALF]);
  });

  it('deletePastRace deletes nothing that is not the caller’s (ADR 0006)', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    const theirRace = await addPastRace(theirs, HALF);

    await deletePastRace(mine, theirRace);

    expect(await pastOf(theirs)).toEqual([HALF]);
  });

  it('getPastRaces reads only the asking athlete’s', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    await addPastRace(theirs, HALF);

    expect(await getPastRaces(mine)).toEqual([]);
  });
});

describe('addRace: the race, its target flag, the mirror and the event in one batch (CodeRabbit, PR #115)', () => {
  const KBH = { name: 'IM Kbh', date: '2027-09-15', distance: 'Full' as const };

  const mirrorOf = async (athleteId: string) =>
    (await testDb.db.select({ raceTarget: athleteTable.raceTarget }).from(athleteTable).where(eq(athleteTable.id, athleteId)))[0]
      .raceTarget;
  const raceAddedEvents = () => testDb.db.select().from(eventsTable).where(eq(eventsTable.type, 'race_added'));

  it('stores a tune-up with its race_added event, and touches neither the target nor the mirror', async () => {
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);

    const id = await addRace(athleteId, KBH, 'none');

    expect(await stored(athleteId)).toEqual([
      { ...COPENHAGEN, isTarget: true },
      { ...KBH, isTarget: false },
    ]);
    expect(await mirrorOf(athleteId)).toBeNull();
    expect(await raceAddedEvents()).toEqual([
      expect.objectContaining({
        athleteId,
        actorType: 'athlete',
        actorId: athleteId,
        payload: { raceId: id, ...KBH, isTarget: false },
      }),
    ]);
  });

  it('stores a first race as the target, with the mirror and the event', async () => {
    const athleteId = await anAthlete('a');

    const id = await addRace(athleteId, KBH, 'first');

    expect((await getTargetRace(athleteId))?.id).toBe(id);
    expect(await mirrorOf(athleteId)).toBe('IM Kbh');
    expect((await raceAddedEvents()).map((e) => e.payload)).toEqual([{ raceId: id, ...KBH, isTarget: true }]);
  });

  it('replaces a target: the old flag is cleared before the new race lands flagged', async () => {
    // The partial unique index allows one target per athlete, so a batch that
    // inserted the flagged race before clearing the old flag would be refused.
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);

    const id = await addRace(athleteId, KBH, 'replace');

    expect(await stored(athleteId)).toEqual([
      { ...COPENHAGEN, isTarget: false },
      { ...KBH, isTarget: true },
    ]);
    expect((await getTargetRace(athleteId))?.id).toBe(id);
    expect(await mirrorOf(athleteId)).toBe('IM Kbh');
  });

  it('replaces only the asking athlete’s target', async () => {
    const mine = await anAthlete('a');
    const theirs = await anAthlete('b');
    await createRace(theirs, COPENHAGEN);

    await addRace(mine, KBH, 'replace');

    expect((await getTargetRace(theirs))?.name).toBe('Ironman Copenhagen');
    expect(await mirrorOf(theirs)).toBeNull();
  });

  it('writes nothing when a part of the batch fails — no race without its event', async () => {
    const athleteId = await anAthlete('a');
    await createRace(athleteId, COPENHAGEN);

    // 'first' beside an existing target: the flagged insert is refused by the
    // index, and the event and mirror in the same batch must go with it.
    await expect(addRace(athleteId, KBH, 'first')).rejects.toThrow();

    expect(await stored(athleteId)).toEqual([{ ...COPENHAGEN, isTarget: true }]);
    expect(await raceAddedEvents()).toEqual([]);
    expect(await mirrorOf(athleteId)).toBeNull();
  });

  it('gives each race a fresh id, the one its event carries', async () => {
    const athleteId = await anAthlete('a');
    const a = await addRace(athleteId, KBH, 'none');
    const b = await addRace(athleteId, KBH, 'none');

    expect(a).not.toBe(b);
    expect((await raceAddedEvents()).map((e) => (e.payload as { raceId: string }).raceId).sort()).toEqual([a, b].sort());
  });
});
