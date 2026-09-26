import { describe, it, expect } from 'vitest';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { detectedActivities, sessions } from '@/db/schema';

/**
 * `garmin-integration/03`, ballot 3 — the idempotency key a sync needs. Read off
 * the Drizzle table config, the way `erasure-schema.test.ts` reads it, so the
 * guarantee is the declared index rather than a remembered convention.
 */
describe('external_id', () => {
  it('is a nullable column on sessions and on detected activities', () => {
    for (const table of [sessions, detectedActivities]) {
      const column = getTableConfig(table).columns.find((c) => c.name === 'external_id');
      expect(column?.notNull).toBe(false);
      expect(column?.getSQLType()).toBe('text');
    }
  });

  it('is unique per athlete on sessions, and only where it is set', () => {
    const index = getTableConfig(sessions).indexes.find((i) => i.config.name === 'sessions_athlete_external_id_idx');
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns.map((c) => (c as { name: string }).name)).toEqual(['athlete_id', 'external_id']);
    const where = new PgDialect().sqlToQuery(index!.config.where!).sql;
    expect(where).toBe('"sessions"."external_id" is not null');
  });
});
