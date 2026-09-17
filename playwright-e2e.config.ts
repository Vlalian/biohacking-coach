import { defineConfig, devices } from '@playwright/test';

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
/** The day every full-page baseline was photographed on. Change it, regenerate all. */
export const PINNED_TODAY = '2026-09-16';

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
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001/en/sign-in',
    // A server started by hand does not carry COACH_TODAY, and the calendar
    // baselines would then fail on the real date. Always our own server.
    reuseExistingServer: false,
    timeout: 120_000,
    // The clock seam (src/lib/date.ts `today()`): every baseline is taken on
    // this day, so the calendar's highlighted cell and visible month hold still.
    env: { COACH_TODAY: PINNED_TODAY },
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
