import { expect, test } from '@playwright/test';
import { settled, shellHeader, snapshot } from './settled';

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
  // The header names whoever is signed in; the seed athlete is Mads and the
  // seed coach is Coach Riley. A swapped or shared storage state fails here
  // before any picture is taken.
  await expect(shellHeader(page)).toContainText('Mads', { ignoreCase: true });
  await expect(shellHeader(page)).not.toContainText('Riley', { ignoreCase: true });
});

for (const route of pages) {
  test(route, async ({ page }) => {
    await page.goto(`/en/${route}`);
    await settled(page);
    await snapshot(page);
  });
}

// Mads holds a coach row that links to nobody since the personas retired
// (code-health/13), so his Roster is the empty state — deliberate, not an error.
test('coach roster, empty', async ({ page }) => {
  await page.goto('/en/coach');
  await settled(page);
  await expect(page.getByText('No athletes linked yet.')).toBeVisible();
  await snapshot(page);
});
