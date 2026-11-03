import { expect, test } from '@playwright/test';
import { settled, snapshot } from './settled';

test('sign-in, signed out', async ({ page }) => {
  await page.goto('/en/sign-in');
  await settled(page);
  await snapshot(page);
});

// showable-version/62: signed out, `/` is the Frontpage, not a redirect to sign-in.
for (const locale of ['en', 'da'] as const) {
  test(`frontpage (${locale}), signed out`, async ({ page }) => {
    await page.goto(`/${locale}`);
    // A redirect to sign-in would otherwise be photographed as the Frontpage (CodeRabbit on PR #133).
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await settled(page);
    await snapshot(page);
  });
}
