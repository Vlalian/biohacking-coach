import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { events } from '@/db/schema';
import { createTestDatabase, seedAthlete, type TestDatabase } from '@/test/pglite';

/**
 * showable-version/61 — whether a week kept through an hours change still holds
 * the old hours, read against a real Postgres (`src/test/pglite.ts`): which
 * events the read picks up, and in which order, is the query's own behaviour.
 */

let testDb: TestDatabase;
vi.mock('@/db', () => ({ getDb: () => testDb.db }));

const { isKeptWeekStale, recordHoursChanged, recordWeekDraftDecision } = await import('./week-draft-repository');

beforeAll(async () => {
  testDb = await createTestDatabase();
}, 60_000);

let ATHLETE: string;
beforeEach(async () => {
  ATHLETE = await seedAthlete(testDb.db, 'kept');
});

afterEach(async () => {
  await testDb.reset();
});

const W41 = '2026-10-05';
const W42 = '2026-10-12';

const decline = (weekStart: string) =>
  recordWeekDraftDecision({ athleteId: ATHLETE, type: 'week_plan_declined', weekStart, draftId: 'd1', sessions: [] });

describe('isKeptWeekStale', () => {
  it('is stale once an hours change keeps that week, and only that week', async () => {
    expect(await isKeptWeekStale(ATHLETE, W41)).toBe(false);
    await recordHoursChanged(ATHLETE, { hours: 10, keptWeek: W41 });
    expect(await isKeptWeekStale(ATHLETE, W41)).toBe(true);
    expect(await isKeptWeekStale(ATHLETE, W42)).toBe(false);
  });

  it('a decline of the kept week clears it; a decline of another week does not', async () => {
    await recordHoursChanged(ATHLETE, { hours: 10, keptWeek: W41 });
    await decline(W42);
    expect(await isKeptWeekStale(ATHLETE, W41)).toBe(true);
    await decline(W41);
    expect(await isKeptWeekStale(ATHLETE, W41)).toBe(false);
  });

  it('reads the events in the order they happened, whatever order they were inserted in', async () => {
    // A decline dated before the hours change does not clear what the change kept.
    await testDb.db.insert(events).values([
      { athleteId: ATHLETE, actorType: 'athlete', actorId: ATHLETE, type: 'hours_changed', payload: { hours: 10, keptWeek: W41 }, createdAt: new Date('2026-10-02T08:00:00Z') },
      { athleteId: ATHLETE, actorType: 'athlete', actorId: ATHLETE, type: 'week_plan_declined', payload: { weekStart: W41 }, createdAt: new Date('2026-10-01T08:00:00Z') },
    ]);
    expect(await isKeptWeekStale(ATHLETE, W41)).toBe(true);
  });

  it('is another athlete’s change none of this athlete’s business', async () => {
    const other = await seedAthlete(testDb.db, 'other');
    await recordHoursChanged(other, { hours: 10, keptWeek: W41 });
    expect(await isKeptWeekStale(ATHLETE, W41)).toBe(false);
  });
});
