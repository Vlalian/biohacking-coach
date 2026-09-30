import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, sessions } from '@/db/schema';
import { createTestDatabase, seedAthlete, type TestDatabase } from '@/test/pglite';

/**
 * The athlete's own sessions, against a real Postgres (`src/test/pglite.ts`,
 * `code-health/27`/`30`). Each test reads back what the calendar and the
 * activity feed would find: the session row and the event row.
 */

let testDb: TestDatabase;
vi.mock('@/db', () => ({ getDb: () => testDb.db }));

const { createAthleteSession, updateAthleteSession, deleteAthleteSession } = await import('./athlete-session');

beforeAll(async () => {
  testDb = await createTestDatabase();
}, 60_000);

let OWNER: string;
beforeEach(async () => {
  OWNER = await seedAthlete(testDb.db, 'owner');
});

afterEach(async () => {
  await testDb.reset();
});

const TODAY = '2026-07-15';

const create = (over: Partial<Parameters<typeof createAthleteSession>[0]> = {}) =>
  createAthleteSession({
    athleteId: OWNER,
    date: '2026-07-17',
    type: 'Strength',
    durationMin: 45,
    isTraining: true,
    note: null,
    today: TODAY,
    ...over,
  });

const update = (sessionId: string, over: Partial<Parameters<typeof updateAthleteSession>[0]> = {}) =>
  updateAthleteSession({
    athleteId: OWNER,
    sessionId,
    type: 'Strength',
    durationMin: 30,
    isTraining: true,
    note: 'updated',
    expectedVersion: 1,
    ...over,
  });

const remove = (sessionId: string, over: Partial<Parameters<typeof deleteAthleteSession>[0]> = {}) =>
  deleteAthleteSession({ athleteId: OWNER, sessionId, expectedVersion: 1, ...over });

/** A session already on the plan, written directly — for the edit and delete gates. */
async function aSession(over: Partial<typeof sessions.$inferInsert> = {}): Promise<string> {
  const [row] = await testDb.db
    .insert(sessions)
    .values({ athleteId: OWNER, origin: 'athlete', date: '2026-07-17', type: 'Strength', ...over })
    .returning({ id: sessions.id });
  return row.id;
}

async function sessionById(id: string) {
  const [row] = await testDb.db.select().from(sessions).where(eq(sessions.id, id));
  return row;
}

const allEvents = () => testDb.db.select().from(events);
const allSessions = () => testDb.db.select().from(sessions);

describe('createAthleteSession', () => {
  it('stores the athlete’s own session and returns exactly what it stored (showable-version/44)', async () => {
    const result = await create({ note: 'gym' });

    if (!result.ok) throw new Error('expected the session to land');
    const row = await sessionById(result.session.id);
    expect(row).toMatchObject({
      athleteId: OWNER,
      origin: 'athlete',
      date: '2026-07-17',
      type: 'Strength',
      duration: 45,
      isTraining: true,
      note: 'gym',
      dayOrder: 0,
      version: 1,
    });
    expect(result.session).toMatchObject({
      id: row.id,
      date: row.date,
      type: row.type,
      status: row.status,
      origin: row.origin,
      dayOrder: row.dayOrder,
      version: row.version,
    });
  });

  it('records an athlete_session_created event by the athlete, carrying the session', async () => {
    const result = await create();

    if (!result.ok) throw new Error('expected the session to land');
    expect(await allEvents()).toEqual([
      expect.objectContaining({
        athleteId: OWNER,
        actorType: 'athlete',
        actorId: OWNER,
        type: 'athlete_session_created',
        payload: { sessionId: result.session.id, date: '2026-07-17', type: 'Strength' },
      }),
    ]);
  });

  it('stores a retro-logged session as completed when the date is today or earlier', async () => {
    const today = await create({ date: TODAY });
    const earlier = await create({ date: '2026-07-01' });

    if (!today.ok || !earlier.ok) throw new Error('expected both to land');
    expect((await sessionById(today.session.id)).status).toBe('completed');
    expect((await sessionById(earlier.session.id)).status).toBe('completed');
  });

  it('stores a future session as planned', async () => {
    const result = await create({ date: '2026-08-01', type: 'Mobility', durationMin: null, isTraining: false });

    if (!result.ok) throw new Error('expected the session to land');
    expect(await sessionById(result.session.id)).toMatchObject({ status: 'planned', duration: null, isTraining: false });
  });

  it('puts a second session on the same day after the first, and a session on another day first', async () => {
    // The calendar orders a Double by dayOrder. It is allocated inside the
    // INSERT, so two sessions added to one day cannot land on the same slot.
    const first = await create();
    const second = await create();
    const elsewhere = await create({ date: '2026-07-18' });

    if (!first.ok || !second.ok || !elsewhere.ok) throw new Error('expected all three to land');
    expect([first.session.dayOrder, second.session.dayOrder, elsewhere.session.dayOrder]).toEqual([0, 1, 0]);
  });

  it('counts only this athlete’s sessions on that day when placing a new one', async () => {
    const stranger = await seedAthlete(testDb.db, 'stranger');
    await aSession({ athleteId: stranger, date: '2026-07-17', dayOrder: 0 });

    const result = await create();

    if (!result.ok) throw new Error('expected the session to land');
    expect(result.session.dayOrder).toBe(0);
  });

  it('refuses an invalid session type, and stores nothing', async () => {
    expect(await create({ type: 'Yoga' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await allSessions()).toEqual([]);
    expect(await allEvents()).toEqual([]);
  });

  it('refuses a non-positive duration, and stores nothing', async () => {
    expect(await create({ durationMin: 0 })).toEqual({ ok: false, reason: 'invalid' });
    expect(await allSessions()).toEqual([]);
  });
});

describe('updateAthleteSession', () => {
  it('stores the edit to the athlete’s own session and reports the new version', async () => {
    const id = await aSession({ duration: 45 });

    expect(await update(id)).toEqual({ ok: true, version: 2 });
    expect(await sessionById(id)).toMatchObject({ type: 'Strength', duration: 30, note: 'updated', version: 2 });
  });

  it('refuses to edit a Coach-planned session — content is read-only', async () => {
    const id = await aSession({ origin: 'coach', note: 'the plan' });

    expect(await update(id)).toEqual({ ok: false, reason: 'not-athlete-authored' });
    expect(await sessionById(id)).toMatchObject({ note: 'the plan', version: 1 });
  });

  it('refuses another athlete’s session', async () => {
    const stranger = await seedAthlete(testDb.db, 'stranger');
    const id = await aSession({ athleteId: stranger, note: 'theirs' });

    expect(await update(id)).toEqual({ ok: false, reason: 'not-owner' });
    expect(await sessionById(id)).toMatchObject({ note: 'theirs', version: 1 });
  });

  it('refuses an invalid edit, and leaves the session as it was', async () => {
    const id = await aSession({ duration: 45 });

    expect(await update(id, { durationMin: 0 })).toEqual({ ok: false, reason: 'invalid' });
    expect(await sessionById(id)).toMatchObject({ duration: 45, version: 1 });
  });

  it('refuses an edit to a session that does not exist', async () => {
    expect(await update('00000000-0000-4000-8000-000000000000')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('refuses an edit that lost the race, and says what it tried', async () => {
    const id = await aSession({ duration: 45, version: 2 });

    const result = await update(id, { durationMin: 30, isTraining: false });

    if (result.ok || result.reason !== 'conflict') throw new Error('expected a conflict');
    expect(result.conflict.divergences).toEqual(
      expect.arrayContaining([
        { field: 'duration', current: '45', attempted: '30' },
        { field: 'isTraining', current: 'true', attempted: 'false' },
      ]),
    );
    expect(await sessionById(id)).toMatchObject({ duration: 45, version: 2 });
  });

  it('a conflicting edit that cleared the duration says it tried to clear it', async () => {
    const id = await aSession({ duration: 45, version: 2 });

    const result = await update(id, { durationMin: null });

    if (result.ok || result.reason !== 'conflict') throw new Error('expected a conflict');
    expect(result.conflict.divergences).toContainEqual({ field: 'duration', current: '45', attempted: null });
  });
});

describe('deleteAthleteSession', () => {
  it('deletes the athlete’s own session and records it as the athlete’s', async () => {
    const id = await aSession();

    expect(await remove(id)).toEqual({ ok: true, version: 1 });
    expect(await allSessions()).toEqual([]);
    expect(await allEvents()).toEqual([
      expect.objectContaining({
        athleteId: OWNER,
        actorType: 'athlete',
        actorId: OWNER,
        type: 'athlete_session_deleted',
        payload: { sessionId: id },
      }),
    ]);
  });

  it('refuses a delete against a stale version, leaving the row alone and logging nothing', async () => {
    const id = await aSession({ version: 2 });

    const result = await remove(id);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a conflict');
    expect(result.reason).toBe('conflict');
    expect(await allSessions()).toHaveLength(1);
    expect(await allEvents()).toEqual([]);
  });

  it('deletes a completed one too — the athlete can undo an accepted import', async () => {
    // An accepted Detected Activity with no Week Plan match is written as a
    // retro-logged Athlete Session, already completed (showable-version/14).
    // Frozenness governs *moving and editing* the record, not disowning an
    // entry the athlete put there — otherwise a wrong file is permanent.
    const id = await aSession({ status: 'completed', date: '2026-07-01' });

    expect(await remove(id)).toEqual({ ok: true, version: 1 });
    expect(await allSessions()).toEqual([]);
  });

  it('refuses to delete a Coach-planned session', async () => {
    const id = await aSession({ origin: 'coach' });

    expect(await remove(id)).toEqual({ ok: false, reason: 'not-athlete-authored' });
    expect(await allSessions()).toHaveLength(1);
  });

  it('refuses another athlete’s session', async () => {
    const stranger = await seedAthlete(testDb.db, 'stranger');
    const id = await aSession({ athleteId: stranger });

    expect(await remove(id)).toEqual({ ok: false, reason: 'not-owner' });
    expect(await allSessions()).toHaveLength(1);
  });

  it('returns not-found when the session does not exist', async () => {
    expect(await remove('00000000-0000-4000-8000-000000000000')).toEqual({ ok: false, reason: 'not-found' });
  });
});
