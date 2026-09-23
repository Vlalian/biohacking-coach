import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The seed builds Mads's week of history and the personas' ten weeks relative
 * to "now". The app reads "now" through `today()` in `src/lib/date.ts`, which
 * honours `COACH_TODAY` outside production; the seed read `new Date()`, so a
 * pinned page suite got a pinned calendar cell over sessions that moved one
 * day per real day, and three baselines went red every morning
 * (frontend-quality/09). Both anchor sites now go through `startOfToday()`,
 * the same clock, and this pins that no site slides back to the real one.
 */
describe('scripts/seed.ts anchors history on the app clock', () => {
  const source = readFileSync(fileURLToPath(new URL('./seed.ts', import.meta.url)), 'utf8');

  it('never reads the real clock directly', () => {
    expect(source).not.toMatch(/new Date\(\)/);
    expect(source).not.toMatch(/Date\.now\(\)/);
  });

  it('takes its anchor from the clock seam, at both history sites', () => {
    expect(source).toMatch(/import \{[^}]*\bstartOfToday\b[^}]*\} from '\.\.\/src\/lib\/date'/);
    expect(source.match(/startOfToday\(\)/g)).toHaveLength(2);
  });
});
