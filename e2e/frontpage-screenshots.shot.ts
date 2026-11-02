import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { settled } from './settled';
import { PINNED_TODAY } from './pinned-today';

/**
 * The Frontpage's four pictures of the app (showable-version/63), written to
 * `public/frontpage/` by `npm run frontpage:screenshots`. Seed accounts only,
 * signed in through the saved sessions of the `setup` project; the pictures
 * are English in both locales (ticket comment, 2026-10-07).
 */
const OUT = 'public/frontpage';
const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const ATHLETE = 'e2e/.auth/athlete.json';
const COACH = 'e2e/.auth/coach.json';

console.log(`[frontpage] Pictures taken on the pinned day ${PINNED_TODAY}.`);

async function capture(page: Page, file: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${file}` });
}

test.describe('the coach', () => {
  test.use({ storageState: COACH, viewport: LAPTOP });

  test('roster-view.png: the Roster', async ({ page }) => {
    await page.goto('/en/coach');
    await settled(page);
    await capture(page, 'roster-view.png');
  });
});

test.describe('the athlete on a laptop', () => {
  test.use({ storageState: ATHLETE, viewport: LAPTOP });

  test('training-plan.png: the Training Plan', async ({ page }) => {
    await page.goto('/en/training-plan');
    await settled(page);
    await capture(page, 'training-plan.png');
  });

  test('information-view.png: the Information View', async ({ page }) => {
    await page.goto('/en/information');
    await settled(page);
    await capture(page, 'information-view.png');
  });
});

test.describe('the athlete on a phone', () => {
  test.use({ storageState: ATHLETE, viewport: PHONE });

  test('coach-chat.png: the Coach Overlay open on the Coach Chat thread', async ({ page }) => {
    await page.goto('/en/training-plan');
    await settled(page);
    await page.getByRole('button', { name: 'Open Momentum' }).click();
    // The thread written by the global setup; its last message is the coach's.
    await page.getByText('Thursday is now the easy run').waitFor();
    await settled(page);
    await capture(page, 'coach-chat.png');
  });
});
