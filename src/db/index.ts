import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as appSchema from './schema';
import * as authSchema from './auth-schema';

// One drizzle schema for the whole database: the app's tables plus the ones
// better-auth owns. The auth adapter looks its tables up by name off the drizzle
// instance, so `user`, `session`, `account`, and `verification` must be here or
// login cannot query them.
const schema = { ...appSchema, ...authSchema };

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | undefined;

/**
 * The Postgres connection, created on first use rather than on import.
 *
 * Lazy on purpose: importing a module must not open a connection. That keeps
 * `npm run build`, `npm test`, and CI runnable without a **live database**.
 *
 * It does not keep them runnable without the **env var**, and an earlier
 * version of this comment claimed it did ("only code that actually queries
 * needs DATABASE_URL"). `src/lib/auth.ts` calls `getDb()` at module load to
 * build the better-auth adapter, so every route reaching auth — `/api/export`
 * is the one that fails first — evaluates this during `next build`'s page-data
 * collection. A build in a checkout with no `.env.local` therefore dies here,
 * with this function's own error message and nothing to say it came from a
 * missing file rather than a broken database. Any value satisfies it; nothing
 * connects until a query runs. Corrected rather than deleted because the wrong
 * clause is what makes the failure confusing.
 */
export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;

    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env.local and paste your ' +
          'Neon connection string into it. .env.local is gitignored — never commit it.',
      );
    }

    cached = drizzle(neon(url), { schema });
  }

  return cached;
}
