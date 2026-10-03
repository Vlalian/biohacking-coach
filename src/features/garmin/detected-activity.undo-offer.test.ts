import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { events as eventsTable, sessions as sessionsTable } from '@/db/schema';
import { createTestDatabase, seedAthlete, type TestDatabase } from '@/test/pglite';

/**
 * Which sessions the Session Drawer offers "Undo import" on, against a real
 * Postgres (`src/test/pglite.ts`): the rows a caller would find, never which
 * statements were issued.
 *
 * The offer has to match what `undoDetectedImport` will actually do. It once
 * listed every session with any `garmin_imported` event, so the button showed
 * after an undo, after an undo and a manual completion, and on an unmatched
 * upload's Athlete Session, and each click then failed `not-imported`
 * (code-health/34 A4).
 */

let testDb: TestDatabase;
vi.mock('@/db', () => ({ getDb: () => testDb.db }));

const { listImportedSessionIds } = await import('./detected-activity');

beforeAll(async () => {
  testDb = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await testDb.reset();
});

async function aSession(athleteId: string, over: { origin?: string; status?: string } = {}): Promise<string> {
  const [row] = await testDb.db
    .insert(sessionsTable)
    .values({ athleteId, date: '2026-09-22', type: 'Endurance', origin: 'coach', status: 'completed', ...over })
    .returning({ id: sessionsTable.id });
  return row.id;
}

/** An import event, at a given minute so the order of events is the order written. */
async function anEvent(athleteId: string, sessionId: string, type: string, minute: number): Promise<void> {
  await testDb.db.insert(eventsTable).values({
    athleteId,
    actorType: 'athlete',
    actorId: athleteId,
    type,
    payload: { sessionId },
    createdAt: new Date(Date.UTC(2026, 8, 22, 6, minute)),
  });
}

describe('listImportedSessionIds offers undo exactly where undo will act', () => {
  it('lists a planned session completed by accepting an import', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const sessionId = await aSession(athleteId);
    await anEvent(athleteId, sessionId, 'garmin_imported', 0);

    expect(await listImportedSessionIds(athleteId)).toEqual([sessionId]);
  });

  it('does not list a session whose import was undone, nor one then completed by hand', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const undone = await aSession(athleteId, { status: 'planned' });
    await anEvent(athleteId, undone, 'garmin_imported', 0);
    await anEvent(athleteId, undone, 'garmin_import_undone', 1);
    const completedByHand = await aSession(athleteId);
    await anEvent(athleteId, completedByHand, 'garmin_imported', 2);
    await anEvent(athleteId, completedByHand, 'garmin_import_undone', 3);

    expect(await listImportedSessionIds(athleteId)).toEqual([]);
  });

  it('lists a session imported again after an undo — the newest event decides', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const sessionId = await aSession(athleteId);
    await anEvent(athleteId, sessionId, 'garmin_imported', 0);
    await anEvent(athleteId, sessionId, 'garmin_import_undone', 1);
    await anEvent(athleteId, sessionId, 'garmin_imported', 2);

    expect(await listImportedSessionIds(athleteId)).toEqual([sessionId]);
  });

  it('does not list the Athlete Session an unmatched upload created — deleting it is that undo', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const sessionId = await aSession(athleteId, { origin: 'athlete' });
    await anEvent(athleteId, sessionId, 'garmin_imported', 0);

    expect(await listImportedSessionIds(athleteId)).toEqual([]);
  });

  it('skips an import event that names no session rather than failing the Training Plan', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const sessionId = await aSession(athleteId);
    await anEvent(athleteId, sessionId, 'garmin_imported', 0);
    await testDb.db.insert(eventsTable).values({ athleteId, actorType: 'athlete', type: 'garmin_imported', payload: null });

    expect(await listImportedSessionIds(athleteId)).toEqual([sessionId]);
  });

  it('lists only this athlete’s imports', async () => {
    const mine = await seedAthlete(testDb.db, 'a');
    const theirs = await seedAthlete(testDb.db, 'b');
    const theirSession = await aSession(theirs);
    await anEvent(theirs, theirSession, 'garmin_imported', 0);

    expect(await listImportedSessionIds(mine)).toEqual([]);
  });
});
