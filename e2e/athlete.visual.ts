import { expect, test } from '@playwright/test';
import { settled, snapshot } from './settled';

/**
 * The athlete's pages, signed in as the seed athlete. Layout only: anything
 * the Coach or the calendar generates fresh is masked, and each mask says why.
 */
const pages = [
  'training-plan',
  'information',
  'equipment',
  'feedback',
  'settings',
  'privacy',
] as const;

test('the session is the athlete', async ({ page }) => {
  await page.goto('/en/training-plan');
  await settled(page);
  await expect(page).not.toHaveURL(/sign-in/);
});

for (const route of pages) {
  test(route, async ({ page }) => {
    await page.goto(`/en/${route}`);
    await settled(page);
    await snapshot(page);
  });
}
