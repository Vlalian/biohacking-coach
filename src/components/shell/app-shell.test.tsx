import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The shell has no render test — it is hooks, context and a nav drawer — so the
 * one invariant a bug taught us is pinned on the source, the way the coach plan
 * page's wiring is (`week-draft-review.test.tsx`).
 */
describe('AppShell', () => {
  it('sizes its frame with h-dvh, never 100vh — a phone’s file picker resizes the viewport and h-screen did not follow (showable-version/30)', () => {
    const source = readFileSync(fileURLToPath(new URL('./app-shell.tsx', import.meta.url)), 'utf8');
    expect(source).toMatch(/className="flex h-dvh flex-col overflow-hidden/);
    expect(source).not.toMatch(/\bh-screen\b/);
  });

  it('shows the brand once, in the top bar — the drawer does not repeat it (frontend-quality/11)', () => {
    // The top bar sits outside the drawer's container, so its wordmark stays in
    // view with the drawer open. A second one inside the drawer was the double.
    const source = readFileSync(fileURLToPath(new URL('./app-shell.tsx', import.meta.url)), 'utf8');
    expect(source.match(/<Wordmark /g)).toHaveLength(1);
    expect(source.indexOf('<Wordmark')).toBeLessThan(source.indexOf('<nav'));
  });
});
