import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The root layout is fonts and providers — no logic to render — so its one
 * ruled setting is pinned on the source, the way `app-shell.test.tsx` pins the
 * shell's frame.
 */
describe('RootLayout', () => {
  it('opens in the light theme until the user picks another (Mads, 2026-09-25)', () => {
    const source = readFileSync(fileURLToPath(new URL('./layout.tsx', import.meta.url)), 'utf8');
    expect(source).toMatch(/defaultTheme="light"/);
  });
});
