import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { getDb } from '@/db';
import * as appSchema from '@/db/schema';
import * as authSchema from '@/db/auth-schema';
import { athlete } from '@/db/schema';
import { user } from '@/db/auth-schema';

/**
 * A real Postgres for repository tests, running in the test process
 * (`code-health/30`).
 *
 * The hand-built Drizzle mocks each repository test used to carry recorded the
 * calls they got and applied none of them, so the only thing a test could
 * assert on was the call log — statement counts, SQL-text regexes, the keys of
 * a `select`. None of that is anything a caller can lose, and all of it breaks
 * on the first refactor that keeps behaviour. Here the statements run: a test
 * writes through the repository and reads the rows back, and the schema's own
 * constraints (the partial unique indexes above all) refuse what Postgres would.
 *
 * Built by drizzle's migrator from `drizzle/` and its journal, so the database
 * under test is the one production has — not a second description of it to
 * keep in step. Resolved from this file, never from `process.cwd()`: the
 * mutation gate runs the suite from a sandbox copy (`source-sweep.ts` says why
 * that matters).
 */
const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));

// The same schema object `getDb()` is built with (`src/db/index.ts`), so
// `db.query.<table>` reads work here as they do there.
const schema = { ...appSchema, ...authSchema };

type AppDb = ReturnType<typeof getDb>;

export interface TestDatabase {
  /** Stands in for `getDb()`: the same query builder, over the in-process database. */
  db: AppDb;
  /** Empties every table, so each test starts from nothing. */
  reset: () => Promise<void>;
}

/**
 * A migrated database and the `getDb()` stand-in over it. Boot it once per test
 * file (`beforeAll`) and `reset` it between tests: booting costs seconds, a
 * reset milliseconds.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  // pgvector: the knowledge-oracle corpus table has a `vector(1536)` column.
  const pg = await PGlite.create({ extensions: { vector } });
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });

  // neon-http's `db.batch` runs its statements as one transaction, in order,
  // and the pglite driver has no `batch`. PGlite is a single connection, so an
  // explicit BEGIN around the statements is that same transaction: one that
  // throws leaves nothing written, which is the property the repositories
  // lean on (`setTargetRace`'s clear-then-set, for one).
  const batch = async (statements: readonly PromiseLike<unknown>[]) => {
    await pg.exec('BEGIN');
    try {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement);
      await pg.exec('COMMIT');
      return results;
    } catch (error) {
      await pg.exec('ROLLBACK');
      throw error;
    }
  };

  const tables = await pg.query<{ name: string }>(
    "select quote_ident(tablename) as name from pg_tables where schemaname = 'public'",
  );
  const truncate = `TRUNCATE ${tables.rows.map((t) => t.name).join(', ')} RESTART IDENTITY CASCADE`;

  return {
    db: Object.assign(db, { batch }) as unknown as AppDb,
    reset: async () => {
      await pg.exec(truncate);
    },
  };
}

/**
 * An athlete to own rows: the `athlete` row and the `user` it hangs off. Most
 * tables key on `athlete_id` with a foreign key, so almost every repository
 * test starts here. `tag` keeps two athletes in one test apart.
 */
export async function seedAthlete(db: AppDb, tag: string): Promise<string> {
  await db.insert(user).values({ id: `user_${tag}`, name: tag, email: `${tag}@test.invalid` });
  const [row] = await db.insert(athlete).values({ userId: `user_${tag}` }).returning({ id: athlete.id });
  return row.id;
}
