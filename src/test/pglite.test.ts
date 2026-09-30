import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { athlete, knowledgeChunks, race } from '@/db/schema';
import { user } from '@/db/auth-schema';
import { createTestDatabase, seedAthlete, type TestDatabase } from './pglite';

/**
 * The in-process database repository tests stand on (`code-health/30`).
 *
 * Each test builds its own, inside the test: code that only ran in a
 * `beforeAll` is credited to no test, and the mutation gate would count every
 * line of this helper as untested however many suites lean on it.
 */

const BOOT_MS = 60_000;

const anAthlete = (t: TestDatabase, tag: string) => seedAthlete(t.db, tag);

const RACE = { name: 'Ironman Copenhagen', date: '2027-08-15', distance: 'Full' };

describe('createTestDatabase', () => {
  it(
    'is the migrated schema: tables, the pgvector column and the partial unique indexes',
    async () => {
      const t = await createTestDatabase();
      const athleteId = await anAthlete(t, 'a');

      await t.db.insert(race).values({ athleteId, ...RACE, isTarget: true });
      // `race_one_target_per_athlete` is a migration's, not this helper's.
      await expect(t.db.insert(race).values({ athleteId, ...RACE, isTarget: true })).rejects.toThrow();

      // A table whose column type only exists once the vector extension is loaded.
      expect(await t.db.select().from(knowledgeChunks)).toEqual([]);
    },
    BOOT_MS,
  );

  it(
    'answers relational reads the way getDb() does',
    async () => {
      const t = await createTestDatabase();
      const athleteId = await anAthlete(t, 'a');

      const found = await t.db.query.athlete.findFirst({ where: eq(athlete.id, athleteId) });
      expect(found?.userId).toBe('user_a');
    },
    BOOT_MS,
  );

  it(
    'batch applies its statements in order and answers with each one’s result',
    async () => {
      const t = await createTestDatabase();
      const athleteId = await anAthlete(t, 'a');
      const db = t.db;

      const [inserted, cleared] = await db.batch([
        db.insert(race).values({ athleteId, ...RACE, isTarget: true }).returning({ name: race.name }),
        db.update(race).set({ isTarget: false }).returning({ isTarget: race.isTarget }),
      ]);

      expect(inserted).toEqual([{ name: 'Ironman Copenhagen' }]);
      expect(cleared).toEqual([{ isTarget: false }]);
    },
    BOOT_MS,
  );

  it(
    'batch is all or nothing: a failing statement leaves the earlier ones unwritten',
    async () => {
      const t = await createTestDatabase();
      const athleteId = await anAthlete(t, 'a');
      const db = t.db;

      await expect(
        db.batch([
          db.insert(race).values({ athleteId, ...RACE }),
          db.insert(race).values({ athleteId: 'not-a-uuid', ...RACE }),
        ]),
      ).rejects.toThrow();
      expect(await db.select().from(race)).toEqual([]);

      // And the connection is usable afterwards, not stuck in the aborted transaction.
      await db.insert(race).values({ athleteId, ...RACE });
      expect(await db.select().from(race)).toHaveLength(1);
    },
    BOOT_MS,
  );

  it(
    'reset empties every table, the auth tables included',
    async () => {
      const t = await createTestDatabase();
      const athleteId = await anAthlete(t, 'a');
      await t.db.insert(race).values({ athleteId, ...RACE });

      await t.reset();

      expect(await t.db.select().from(race)).toEqual([]);
      expect(await t.db.select().from(athlete)).toEqual([]);
      expect(await t.db.select().from(user)).toEqual([]);
    },
    BOOT_MS,
  );
});

describe('seedAthlete', () => {
  it(
    'stores an athlete joined to its own user, and keeps two apart by tag',
    async () => {
      const t = await createTestDatabase();

      const a = await seedAthlete(t.db, 'a');
      const b = await seedAthlete(t.db, 'b');

      expect(a).not.toBe(b);
      const rows = await t.db.select({ id: athlete.id, userId: athlete.userId }).from(athlete);
      expect(rows).toEqual(expect.arrayContaining([{ id: a, userId: 'user_a' }, { id: b, userId: 'user_b' }]));
      expect((await t.db.select({ email: user.email }).from(user)).map((u) => u.email).sort()).toEqual([
        'a@test.invalid',
        'b@test.invalid',
      ]);
    },
    BOOT_MS,
  );
});
