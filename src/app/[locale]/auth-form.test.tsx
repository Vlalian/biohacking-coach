import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The form's success handler is async UI glue that a static render cannot
 * click, so the wiring is pinned at the source: after sign-in it asks for the
 * stored language and pushes to the locale `localeAfterSignIn` picks. The
 * decision itself is tested in `src/i18n/locale-after-sign-in.test.ts`, the
 * read in `locale-actions.test.ts`.
 */
describe('AuthForm — the locale after sign-in', () => {
  const src = readFileSync(new URL('./auth-form.tsx', import.meta.url), 'utf8');

  it('lands on the stored language, not the sign-in page’s locale', () => {
    expect(src).toMatch(/await preferredLocaleAction\(\)/);
    expect(src).toMatch(/router\.push\('\/', \{ locale: localeAfterSignIn\(/);
    expect(src).not.toMatch(/router\.push\('\/'\);/);
  });
});
