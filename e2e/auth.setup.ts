import { expect, test as setup } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

/**
 * Signs each role in once, through the real form, and saves the cookies for
 * the page projects. The accounts are the seed accounts (`scripts/seed.ts`):
 * `SEED_MADS_*` is the athlete, `SEED_COACH_*` is Coach Riley, who holds a
 * coach row and no athlete row.
 */
loadEnv({ path: ['.env.local', '.env'] });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — the seed accounts live in .env.local`);
  return value;
}

const roles = [
  { name: 'athlete', email: 'SEED_MADS_EMAIL', password: 'SEED_MADS_PASSWORD' },
  { name: 'coach', email: 'SEED_COACH_EMAIL', password: 'SEED_COACH_PASSWORD' },
] as const;

for (const role of roles) {
  setup(`sign in as ${role.name}`, async ({ page }) => {
    await page.goto('/en/sign-in');
    await page.locator('input[type="email"]').fill(requireEnv(role.email));
    await page.locator('input[type="password"]').fill(requireEnv(role.password));
    await page.locator('button[type="submit"]').click();
    // The form pushes to `/` on success; anything still on sign-in is a failure.
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 30_000 });
    await page.context().storageState({ path: `e2e/.auth/${role.name}.json` });
  });
}
