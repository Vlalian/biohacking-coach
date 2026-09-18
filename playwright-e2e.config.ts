import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

loadEnv({ path: ['.env.local', '.env'] });

/**
 * The suite's own database (frontend-quality/07): the Neon branch `test/e2e`,
 * named by E2E_DATABASE_URL in .env.local and reseeded by e2e/global.setup.ts
 * before every run, so the pictures always start from the same rows and no
 * live session's writes to the dev branch can move them.
 */
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
if (!e2eDatabaseUrl) {
  throw new Error(
    'E2E_DATABASE_URL is not set. The page suite needs its own database: add the ' +
      'connection string of the Neon branch test/e2e to .env.local ' +
      '(`neon connection-string test/e2e`).',
  );
}

/**
 * Full-page snapshots of every tester-facing page, as the athlete and as the
 * Head Coach (frontend-quality/05). Runs against the dev server and the seeded
 * dev database; the two roles sign in once each through the real form, using
 * the seed accounts from `.env.local`, and every page test reuses that session.
 *
 * Same platform ruling as the component harness: `-win32` baselines,
 * committed, regenerated on Linux the day CI exists. Every database this runs
 * against holds seed data only (Mads, 2026-09-16), so the PNGs carry nothing
 * real.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.visual.ts',
  snapshotPathTemplate:
    '{testDir}/__snapshots__/{testFileName}/{arg}{-projectName}{-snapshotSuffix}{ext}',
  // Pages share one dev server and one database; serial keeps the compile
  // cache warm and the screenshots free of each other's requests.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    // Pinned so a baseline is a fixed frame, not whatever window the run had.
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  },
  globalSetup: './e2e/global.setup.ts',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001/en/sign-in',
    // Always our own server: a hand-started one is on the dev database with
    // the Coach live, and its pictures would be of somebody else's data.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      // The Coach stays silent (coach-client.ts `CoachDisabledError`): the
      // layout drafts next week in after() on every athlete page, and a live
      // Coach spent tokens and changed the next picture on every run. The key
      // is a dud on purpose, so a call that slipped past the switch fails
      // loudly (401 in the dev log) instead of spending money.
      COACH_DISABLED: '1',
      ANTHROPIC_API_KEY: 'sk-ant-e2e-disabled',
      OPENAI_API_KEY: 'sk-e2e-disabled',
      // No pinned date, by Mads's ruling (2026-09-17): the baselines are taken
      // on the real day, so the two calendar pages drift as the calendar does
      // and are refreshed with `npm run test:e2e:update` when they do.
    },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      // The first sign-in hits a cold dev server compiling the auth route;
      // one retry covers that without hiding a real failure.
      retries: 1,
    },
    {
      name: 'public',
      testMatch: /public\.visual\.ts/,
    },
    {
      name: 'athlete',
      testMatch: /athlete\.visual\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/athlete.json' },
    },
    {
      name: 'coach',
      testMatch: /coach\.visual\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/coach.json' },
    },
  ],
});
