import { expect, test } from '@playwright/test';
import { calendarMasks, settled, snapshot } from './settled';

/**
 * The Head Coach's pages, signed in as the seed coach. The athlete pages are
 * the first entry on the Roster, whoever the seed linked; the id is read from
 * the page rather than pinned, so a reseed does not break the suite.
 */
const athletePages = ['plan', 'briefing', 'information'] as const;

async function firstRosterAthlete(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/en/coach');
  await settled(page);
  const href = await page.locator('a[href*="/coach/athlete/"]').first().getAttribute('href');
  if (!href) throw new Error('The Roster has no athletes — is the database seeded?');
  return href.split('/coach/athlete/')[1].split('/')[0];
}

test('the session is a coach with a roster', async ({ page }) => {
  await page.goto('/en/coach');
  await settled(page);
  await expect(page.locator('a[href*="/coach/athlete/"]').first()).toBeVisible();
});

test('roster', async ({ page }) => {
  await page.goto('/en/coach');
  await settled(page);
  await snapshot(page);
});

for (const sub of athletePages) {
  test(`athlete ${sub}`, async ({ page }) => {
    const id = await firstRosterAthlete(page);
    await page.goto(`/en/coach/athlete/${id}/${sub}`);
    await settled(page);
    await snapshot(page, sub === 'plan' ? calendarMasks(page) : []);
  });
}
