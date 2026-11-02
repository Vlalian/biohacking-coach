import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';
import { PINNED_TODAY } from './e2e/pinned-today';

loadEnv({ path: ['.env.local', '.env'] });

/**
 * The Frontpage's four pictures of the app (showable-version/63), taken on
 * demand by `npm run frontpage:screenshots`, never by the page suite: the e2e
 * config matches only `*.visual.ts`, and this one only `*.shot.ts`.
 *
 * Same ground as the page suite (`playwright-e2e.config.ts`): its own dev
 * server on the reseeded `test/e2e` branch, the Coach switched off, the pinned
 * day, and the seed accounts signed in once by `e2e/auth.setup.ts`. The global
 * setup adds one fictional Coach Chat thread for the phone picture.
 */
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
if (!e2eDatabaseUrl) {
  throw new Error(
    'E2E_DATABASE_URL is not set. The pictures need the page suite database: add the ' +
      'connection string of the Neon branch test/e2e to .env.local ' +
      '(`neon connection-string test/e2e`).',
  );
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.shot.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    colorScheme: 'light',
    // One picture pixel per CSS pixel, so a file's size is its viewport.
    deviceScaleFactor: 1,
  },
  globalSetup: './e2e/frontpage.global.setup.ts',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001/en/sign-in',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      COACH_DISABLED: '1',
      ANTHROPIC_API_KEY: 'sk-ant-e2e-disabled',
      OPENAI_API_KEY: 'sk-e2e-disabled',
      COACH_TODAY: PINNED_TODAY,
    },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      retries: 1,
    },
    {
      name: 'frontpage',
      dependencies: ['setup'],
    },
  ],
});
