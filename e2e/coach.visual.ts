import { expect, test } from '@playwright/test';
import { settled, shellHeader, snapshot } from './settled';

/**
 * The Head Coach's pages, signed in as the seed coach. The athlete pages are
 * Mads's, found on the Roster by name (frontend-quality/10): the Roster also
 * holds the three personas from `seed-template` and has no fixed order, so
 * "the first row" was whoever the database returned first. The id is read from
 * the page rather than pinned, so a reseed does not break the suite.
 */
const athletePages = ['plan', 'briefing', 'information'] as const;

async function rosterAthlete(page: import('@playwright/test').Page, name: string): Promise<string> {
  await page.goto('/en/coach');
  await settled(page);
  const href = await page
    .locator('a[href*="/coach/athlete/"]', { hasText: name })
    .first()
    .getAttribute('href');
  if (!href) throw new Error(`${name} is not on the Roster — is the database seeded?`);
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

/** The seed athlete and the three personas that live on `seed-template` until they retire (code-health/16). */
const ROSTER = ['Mads', 'Alex Rivera', 'Sam Chen', 'Nadia Holm'];

test('roster', async ({ page }) => {
  await page.goto('/en/coach');
  await settled(page);
  // Named before the picture, so a Roster that lost someone fails with a name
  // rather than as a pixel difference.
  for (const name of ROSTER) {
    await expect(page.locator('a[href*="/coach/athlete/"]', { hasText: name })).toBeVisible();
  }
  await snapshot(page);
});

/**
 * H11 (code-health/13): the content-authority guard, visible. The seed gives
 * Mads one Athlete Session — last Sunday's Strength (`seed-history.ts`) — and
 * the Head Coach opening it must find "athlete's own" and no edit or delete.
 * It is Mads's calendar by name, not the Roster's first row: the personas'
 * calendars carry their own Strength sessions. Not a picture:
 * the drawer's copy is the evidence, and a snapshot of it would move with
 * every calendar week.
 */
test("the athlete's own session is view-only for the Head Coach", async ({ page }) => {
  const id = await rosterAthlete(page, 'Mads');
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
    const id = await rosterAthlete(page, 'Mads');
    await page.goto(`/en/coach/athlete/${id}/${sub}`);
    await settled(page);
    await snapshot(page);
  });
}
