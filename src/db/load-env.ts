import { config } from 'dotenv';

/**
 * Loads .env.local for tooling that runs outside Next.js.
 *
 * Next.js reads .env.local by default; drizzle-kit and tsx do not — they get
 * plain dotenv, which only reads .env. Without this, every script fails with
 * "DATABASE_URL is not set" while the variable sits right there in the file.
 *
 * .env.local wins over .env: it holds the real secrets and is gitignored.
 */
config({ path: ['.env.local', '.env'] });
