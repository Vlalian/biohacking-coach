import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

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
