import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { sessions } from '@/db/schema';
import { ATHLETE_SESSION_TYPES } from '@/features/session/athlete-session-rules';

/**
 * "A Race is entered in advance. Anything else is a completed session"
 * (CONTEXT.md, decided 2026-09-09). Slice 09 builds no machinery for a race
 * the athlete did not enter: no column on `sessions` says one was a race, and
 * no session type does. A retro-logged parkrun is training that happened.
 *
 * Pinned by absence, because the temptation the glossary names is exactly the
 * one a later slice will feel — and the day a `race` column or type appears
 * here, this test names the decision it is overturning.
 */
describe('no race marker on sessions', () => {
  it('has no session column that names a race', () => {
    const columns = Object.keys(getTableColumns(sessions));
    expect(columns.filter((c) => /race/i.test(c))).toEqual([]);
  });

  it('has no athlete session type for a race', () => {
    expect(ATHLETE_SESSION_TYPES).toEqual(['Mobility', 'Strength', 'Other']);
  });
});
