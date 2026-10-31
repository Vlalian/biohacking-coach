import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { erasureLog } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/test/pglite';

/**
 * The erasure record's retention (`garmin-connect-api/09`), against a real
 * Postgres (`src/test/pglite.ts`). The boundary is the point: a record erased
 * exactly at the cutoff is three years old to the second, and stays one more day.
 */

let testDb: TestDatabase;
vi.mock('@/db', () => ({ getDb: () => testDb.db }));

const { deleteErasureLogsBefore } = await import('./erasure-repository');

beforeAll(async () => {
  testDb = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await testDb.reset();
});

/** One erasure record, erased at `erasedAt`. */
async function anErasure(erasedAt: string): Promise<void> {
  await testDb.db.insert(erasureLog).values({ consentedPurposes: [], disclosureVersion: '2026-09-24', erasedAt: new Date(erasedAt) });
}

describe('deleteErasureLogsBefore', () => {
  it('deletes the records erased before the cutoff, keeps the rest, and says how many went', async () => {
    await anErasure('2023-10-30T00:00:00Z');
    await anErasure('2023-11-01T23:59:59Z');
    await anErasure('2023-11-02T00:00:00Z');
    await anErasure('2026-10-31T00:00:00Z');

    expect(await deleteErasureLogsBefore(new Date('2023-11-02T00:00:00Z'))).toBe(2);

    const left = await testDb.db.select({ erasedAt: erasureLog.erasedAt }).from(erasureLog);
    expect(left.map((r) => r.erasedAt.toISOString()).sort()).toEqual(['2023-11-02T00:00:00.000Z', '2026-10-31T00:00:00.000Z']);
  });

  it('deletes nothing when every record is younger than the cutoff', async () => {
    await anErasure('2026-10-31T00:00:00Z');
    expect(await deleteErasureLogsBefore(new Date('2023-11-02T00:00:00Z'))).toBe(0);
  });
});
