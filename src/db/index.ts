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
 * Lazy on purpose: importing a module must not open a connection or demand a
 * secret. That keeps `npm run build`, `npm test`, and CI runnable without a
 * live database — only code that actually queries needs DATABASE_URL.
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
