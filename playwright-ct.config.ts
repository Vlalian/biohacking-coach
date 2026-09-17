import path from 'node:path';
import { defineConfig, devices } from '@playwright/experimental-ct-react';

/**
 * Component snapshots for the primitives in `src/components/ui`
 * (frontend-quality/01). Each `*.visual.tsx` mounts one component in a real
 * Chromium and compares it pixel-for-pixel against a committed baseline.
 *
 * Baselines are Windows baselines by ruling (2026-09-16): there is no CI and
 * every run, human or agent, happens on the same machine. The `-win32` suffix
 * Playwright adds is the record of that. Regenerate on Linux the day CI exists.
 *
 * Vite bundles the components, not Next — so nothing under `src/components/ui`
 * may import `next/*` or `next-intl`. The brand fonts are loaded by the locale
 * layout through `next/font`, which Vite never runs; primitives render in the
 * system fallback here, and that is deterministic on one machine.
 */
export default defineConfig({
  testDir: 'src',
  testMatch: '**/*.visual.tsx',
  snapshotPathTemplate:
    '{testDir}/{testFileDir}/__snapshots__/{testFileName}/{arg}{-projectName}{-snapshotSuffix}{ext}',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide' },
  },
  use: {
    trace: 'retain-on-failure',
    ctPort: 3100,
    ctViteConfig: {
      resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
      },
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
