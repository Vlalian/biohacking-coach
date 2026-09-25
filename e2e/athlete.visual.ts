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
  'glossary',
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

// Mads holds a coach row, and `seed-template` links the three personas to it
// until they retire (code-health/16). The reset keeps them, because the seed
// only inserts links (frontend-quality/10), so his Roster lists all three.
test("Mads's own coach account lists the three personas", async ({ page }) => {
  await page.goto('/en/coach');
  await settled(page);
  for (const name of ['Alex Rivera', 'Sam Chen', 'Nadia Holm']) {
    await expect(page.locator('a[href*="/coach/athlete/"]', { hasText: name })).toBeVisible();
  }
  await snapshot(page);
});
