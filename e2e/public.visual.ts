import { test } from '@playwright/test';
import { settled, snapshot } from './settled';

test('sign-in, signed out', async ({ page }) => {
  await page.goto('/en/sign-in');
  await settled(page);
  await snapshot(page);
});
