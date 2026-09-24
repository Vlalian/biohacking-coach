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

/**
 * The dual-role coach row used to be inserted at a fixed primary key under a
 * conflict clause that guarded `user_id` — a different column — so a Neon
 * branch cut from `seed-template`, which already holds that id under the
 * template's Mads, raised `coach_pkey` on the seed's last statement
 * (code-health/24). The writers moved to `scripts/personas/seed-coach-rows.ts`,
 * where they can be tested; this pins that the fixed id has not crept back.
 */
describe('scripts/seed.ts claims a coach row by its user, not by a fixed id', () => {
  const source = readFileSync(fileURLToPath(new URL('./seed.ts', import.meta.url)), 'utf8');

  it('carries no hard-coded coach id', () => {
    expect(source).not.toMatch(/MADS_COACH_ID/);
    expect(source).not.toMatch(/d3a9e2f4-5b6c-4d7e-8f90-1a2b3c4d5e6f/);
  });

  it('writes both coach rows through the one tested helper', () => {
    expect(source).toContain("from './personas/seed-coach-rows'");
    expect(source.match(/ensureCoachRow\(/g)).toHaveLength(2);
    // The insert itself lives in the helper, where a test can reach it.
    expect(source).not.toContain('.insert(coach)');
  });
});
