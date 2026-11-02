import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

/**
 * showable-version/63: the Frontpage's four pictures are taken on demand by
 * their own Playwright config and spec, never by the page suite.
 */
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('frontpage screenshots wiring', () => {
  it('runs the shot spec from its own config, which the e2e config never matches', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['frontpage:screenshots']).toBe('playwright test -c playwright-frontpage.config.ts');
    expect(pkg.scripts['test:e2e']).toBe('playwright test -c playwright-e2e.config.ts');

    const frontpage = read('playwright-frontpage.config.ts');
    expect(frontpage).toContain("testMatch: '**/*.shot.ts'");
    expect(frontpage).toMatch(/name: 'setup'/);
    expect(frontpage).toMatch(/auth\\?\.setup\\?\.ts/);
    expect(frontpage).toContain("from './e2e/pinned-today'");
    expect(frontpage).toContain('COACH_TODAY: PINNED_TODAY');
    expect(frontpage).toContain('frontpage.global.setup');

    const e2e = read('playwright-e2e.config.ts');
    expect(e2e).toContain("testMatch: '**/*.visual.ts'");
    expect(e2e).not.toMatch(/\.shot/);
    expect(existsSync(new URL('e2e/frontpage-screenshots.shot.ts', root))).toBe(true);
  });
});

describe('frontpage screenshots setup', () => {
  // Mads, 2026-11-02: the public pictures must not carry his name. The seed
  // names its athlete after him, so the picture run renames that athlete on
  // its own throwaway branch before anyone signs in.
  it('renames the seed athlete to a fictional name before the pictures, on the e2e branch only', () => {
    const setup = read('e2e/frontpage.global.setup.ts');
    expect(setup).toMatch(/UPDATE "user" SET name = \$\{FRONTPAGE_ATHLETE_NAME\}/);
    expect(setup).toContain('E2E_DATABASE_URL');
    expect(setup).not.toContain('DATABASE_URL =');
    const name = setup.match(/FRONTPAGE_ATHLETE_NAME = '([^']+)'/)?.[1];
    expect(name).toBe('Jonas Berg');
  });
});

describe('frontpage screenshots spec', () => {
  const spec = () => read('e2e/frontpage-screenshots.shot.ts');

  it('uses only the saved athlete and coach sessions and no sign-in form', () => {
    expect(spec()).toContain('.auth/athlete.json');
    expect(spec()).toContain('.auth/coach.json');
    expect(spec()).not.toMatch(/\.fill\(/);
    expect(spec()).not.toMatch(/sign-in/);
    for (const name of spec().match(/SEED_[A-Z_]+/g) ?? []) {
      expect(name).toMatch(/^SEED_(MADS|COACH)_/);
    }
  });

  it('pins the day, settles before each picture and writes the four named files at the ticket viewports', () => {
    expect(spec()).toContain("from './pinned-today'");
    expect(spec()).toContain("from './settled'");
    expect((spec().match(/settled\(page\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    for (const file of ['roster-view.png', 'coach-chat.png', 'training-plan.png', 'information-view.png']) {
      expect(spec()).toContain(file);
    }
    expect(spec()).toMatch(/1440/);
    expect(spec()).toMatch(/900/);
    expect(spec()).toMatch(/390/);
    expect(spec()).toMatch(/844/);
  });
});
