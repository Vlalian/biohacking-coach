import { expect, test } from '@playwright/test';
import { settled, shellHeader, snapshot } from './settled';

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
  // Coach Riley holds a coach row and no athlete row (scripts/seed.ts). The
  // header proves it is her session and not the dual-role athlete's, whose
  // own coach row would make the Roster pass this test too.
  await expect(shellHeader(page)).toContainText('Coach Riley', { ignoreCase: true });
  await expect(shellHeader(page)).not.toContainText('Mads', { ignoreCase: true });
});

test('roster', async ({ page }) => {
  await page.goto('/en/coach');
  await settled(page);
  await snapshot(page);
});

/**
 * H11 (code-health/13): the content-authority guard, visible. The seed gives
 * Mads one Athlete Session — last Sunday's Strength (`seed-history.ts`) — and
 * the Head Coach opening it must find "athlete's own" and no edit or delete.
 * Since the synthetic personas were retired this row is the only such session
 * on any seeded calendar, so it is asserted rather than assumed. Not a picture:
 * the drawer's copy is the evidence, and a snapshot of it would move with
 * every calendar week.
 */
test("the athlete's own session is view-only for the Head Coach", async ({ page }) => {
  const id = await firstRosterAthlete(page);
  await page.goto(`/en/coach/athlete/${id}/plan`);
  await settled(page);
  await page.getByRole('button', { name: 'Strength · completed' }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText("This is the athlete's own session");
  await expect(drawer.getByRole('button', { name: 'Edit session' })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Delete session' })).toHaveCount(0);
});

for (const sub of athletePages) {
  test(`athlete ${sub}`, async ({ page }) => {
    const id = await firstRosterAthlete(page);
    await page.goto(`/en/coach/athlete/${id}/${sub}`);
    await settled(page);
    await snapshot(page);
  });
}
