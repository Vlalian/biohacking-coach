import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, sessions } from '@/db/schema';
import { createTestDatabase, seedAthlete, type TestDatabase } from '@/test/pglite';

/**
 * The Head Coach's writes to a linked athlete's plan, against a real Postgres
 * (`src/test/pglite.ts`, `code-health/27`/`30`). Each test reads back the
 * session row and the event row the action left — what the athlete's calendar
 * and Narration will find — rather than the statements that were issued.
 *
 * The link gate is `coach-repository`'s and is tested there; here it is a
 * switch, so each test says plainly whether the coach is linked.
 */

const { getActiveLink } = vi.hoisted(() => ({ getActiveLink: vi.fn() }));
vi.mock('./coach-repository', () => ({ getActiveLink }));

let testDb: TestDatabase;
vi.mock('@/db', () => ({ getDb: () => testDb.db }));

const {
  prescribeSession,
  editPrescribedSession,
  deletePrescribedSession,
  moveSessionAsHeadCoach,
} = await import('./head-coach-service');

beforeAll(async () => {
  testDb = await createTestDatabase();
}, 60_000);

let ATHLETE: string;
beforeEach(async () => {
  getActiveLink.mockReset();
  getActiveLink.mockResolvedValue(LINK);
  ATHLETE = await seedAthlete(testDb.db, 'athlete');
});

afterEach(async () => {
  await testDb.reset();
});

// `events.actor_id` is a uuid column.
const COACH = '00000000-0000-4000-8000-00000000c0ac';
const LINK = { shareAthleteReports: true, shareAiTranscripts: false };
const VALID = { date: '2026-07-16', type: 'Endurance', duration: 60, zone: 'Zone 2' };

// TODAY sits in the same Mon–Sun week as a session's default date, so an
// unqualified session is live rather than frozen.
const TODAY = '2026-07-16';

/** A session already on the athlete's plan. */
async function aSession(over: Partial<typeof sessions.$inferInsert> = {}): Promise<string> {
  const [row] = await testDb.db
    .insert(sessions)
    .values({ athleteId: ATHLETE, origin: 'coach', date: '2026-07-16', type: 'Endurance', status: 'planned', ...over })
    .returning({ id: sessions.id });
  return row.id;
}

async function sessionById(id: string) {
  const [row] = await testDb.db.select().from(sessions).where(eq(sessions.id, id));
  return row;
}

async function eventsOf(type: string) {
  return testDb.db.select().from(events).where(eq(events.type, type));
}

async function allSessions() {
  return testDb.db.select().from(sessions);
}

async function allEvents() {
  return testDb.db.select().from(events);
}

/** The refusal reason, or 'ok' when the action unexpectedly succeeded. */
function reasonOf(result: { ok: boolean } & { reason?: string }): string {
  return result.ok ? 'ok' : (result.reason ?? 'ok');
}

const edit = (sessionId: string, over: Partial<Parameters<typeof editPrescribedSession>[0]> = {}) =>
  editPrescribedSession({
    headCoachId: COACH,
    athleteId: ATHLETE,
    sessionId,
    input: VALID,
    expectedVersion: 1,
    today: TODAY,
    ...over,
  });

const remove = (sessionId: string, over: Partial<Parameters<typeof deletePrescribedSession>[0]> = {}) =>
  deletePrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId, expectedVersion: 1, today: TODAY, ...over });

describe('prescribeSession — the Head Coach adds a Prescribed Session', () => {
  it('stores it as the Head Coach’s, and returns exactly the session it stored (showable-version/44)', async () => {
    const result = await prescribeSession({ headCoachId: COACH, athleteId: ATHLETE, input: VALID, today: TODAY });

    if (!result.ok) throw new Error('expected the prescription to land');
    const row = await sessionById(result.sessionId);
    expect(row).toMatchObject({
      athleteId: ATHLETE,
      origin: 'head_coach',
      status: 'planned',
      date: VALID.date,
      type: 'Endurance',
      duration: 60,
      zone: 'Zone 2',
      dayOrder: 0,
      version: 1,
    });
    // The calendar's instant copy and the stored row cannot differ.
    expect(result.session).toMatchObject({
      id: row.id,
      origin: row.origin,
      status: row.status,
      date: row.date,
      type: row.type,
      duration: row.duration,
      zone: row.zone,
      dayOrder: row.dayOrder,
      version: row.version,
    });
  });

  it('records a session_prescribed event by the Head Coach, not yet narrated, carrying what was prescribed', async () => {
    const result = await prescribeSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      input: { ...VALID, title: 'Long ride', note: 'Easy' },
      today: TODAY,
    });

    if (!result.ok) throw new Error('expected the prescription to land');
    expect(await eventsOf('session_prescribed')).toEqual([
      expect.objectContaining({
        athleteId: ATHLETE,
        actorType: 'head_coach',
        actorId: COACH,
        narratedAt: null,
        payload: {
          sessionId: result.sessionId,
          date: VALID.date,
          type: 'Endurance',
          duration: 60,
          zone: 'Zone 2',
          title: 'Long ride',
          note: 'Easy',
          isTraining: true,
        },
      }),
    ]);
  });

  it('stores the optional fields a prescription left out as empty, and a training session by default', async () => {
    const result = await prescribeSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      input: { date: VALID.date, type: '  Strength  ' },
      today: TODAY,
    });

    if (!result.ok) throw new Error('expected the prescription to land');
    expect(await sessionById(result.sessionId)).toMatchObject({
      type: 'Strength',
      duration: null,
      zone: null,
      title: null,
      note: null,
      isTraining: true,
    });
  });

  it('refuses to prescribe into a past week, with the same reason edit and delete give', async () => {
    // TODAY is Thursday 2026-07-16, so its week starts Mon 2026-07-13.
    // 2026-07-10 is the Friday before — a week that is over.
    const result = await prescribeSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      input: { ...VALID, date: '2026-07-10' },
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'frozen' });
    expect(await allSessions()).toEqual([]);
    expect(await allEvents()).toEqual([]);
  });

  it('allows an earlier day inside the current week — the week is the unit, not the day', async () => {
    const result = await prescribeSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      input: { ...VALID, date: '2026-07-13' },
      today: TODAY,
    });

    expect(result.ok).toBe(true);
  });

  it('refuses when the Head Coach has no active link to the athlete — nothing written', async () => {
    getActiveLink.mockResolvedValue(undefined);

    const result = await prescribeSession({ headCoachId: COACH, athleteId: ATHLETE, input: VALID, today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'not-linked' });
    expect(await allSessions()).toEqual([]);
  });

  it('refuses an invalid prescription — bad date, blank type, no type at all — without writing', async () => {
    const inputs = [
      { date: '2026-13-40', type: 'X' },
      { date: '2026-07-16', type: '  ' },
      // Untyped JSON reaches this from a form: a missing type must refuse, not throw.
      { date: '2026-07-16' } as unknown as typeof VALID,
    ];
    for (const input of inputs) {
      expect(await prescribeSession({ headCoachId: COACH, athleteId: ATHLETE, input, today: TODAY })).toEqual({
        ok: false,
        reason: 'invalid',
      });
    }
    expect(await allSessions()).toEqual([]);
  });
});

describe('editPrescribedSession — the content tier holds', () => {
  it('stores the edit and reports the version it wrote (showable-version/44)', async () => {
    const id = await aSession({ origin: 'head_coach', version: 4 });

    const result = await edit(id, { input: { ...VALID, title: 'Revised threshold set' }, expectedVersion: 4 });

    expect(result).toEqual({ ok: true, sessionId: id, version: 5 });
    expect(await sessionById(id)).toMatchObject({ title: 'Revised threshold set', duration: 60, version: 5 });
  });

  it('edits a Coach-authored session and records what changed, by whom', async () => {
    const id = await aSession({ origin: 'coach', date: '2026-07-15' });

    await edit(id, { input: { ...VALID, title: 'Revised threshold set' } });

    expect(await eventsOf('session_edited')).toEqual([
      expect.objectContaining({
        athleteId: ATHLETE,
        actorType: 'head_coach',
        actorId: COACH,
        payload: {
          sessionId: id,
          from: { date: '2026-07-15' },
          to: {
            date: VALID.date,
            type: 'Endurance',
            duration: 60,
            zone: 'Zone 2',
            title: 'Revised threshold set',
            note: null,
            isTraining: true,
          },
        },
      }),
    ]);
  });

  it('edits the Head Coach’s own prescription', async () => {
    const id = await aSession({ origin: 'head_coach' });
    expect((await edit(id)).ok).toBe(true);
  });

  it('refuses to edit an Athlete Session — view-only even to the Head Coach', async () => {
    const id = await aSession({ origin: 'athlete', type: 'Run' });

    expect(await edit(id)).toEqual({ ok: false, reason: 'forbidden-origin' });
    expect(await sessionById(id)).toMatchObject({ type: 'Run', version: 1 });
    expect(await allEvents()).toEqual([]);
  });

  it('refuses to edit a Garmin import — the record is immutable', async () => {
    const id = await aSession({ origin: 'garmin' });
    expect(reasonOf(await edit(id))).toBe('forbidden-origin');
    expect(await allEvents()).toEqual([]);
  });

  it('refuses with no active link, and leaves the session as it was', async () => {
    getActiveLink.mockResolvedValue(undefined);
    const id = await aSession({ origin: 'head_coach' });

    expect(await edit(id)).toEqual({ ok: false, reason: 'not-linked' });
    expect(await sessionById(id)).toMatchObject({ version: 1, duration: null });
  });

  it('refuses an invalid edit and leaves the session as it was', async () => {
    const id = await aSession({ origin: 'head_coach' });

    expect(await edit(id, { input: { ...VALID, type: ' ' } })).toEqual({ ok: false, reason: 'invalid' });
    expect(await sessionById(id)).toMatchObject({ type: 'Endurance', version: 1 });
  });

  it('refuses an edit the athlete already overwrote, says what it tried, and logs nothing', async () => {
    // The interleaving FR-5 exists for: the coach opened the editor at version
    // 1, the athlete moved the session in the meantime, and the coach's save
    // arrives second. It must lose visibly rather than silently win.
    const id = await aSession({ origin: 'head_coach', date: '2026-07-17', duration: 30, version: 2 });

    const result = await edit(id, { expectedVersion: 1 });

    if (result.ok || result.reason !== 'conflict') throw new Error('expected a conflict');
    expect(result.conflict.divergences).toEqual(
      expect.arrayContaining([
        { field: 'date', current: '2026-07-17', attempted: VALID.date },
        { field: 'duration', current: '30', attempted: '60' },
      ]),
    );
    expect(await sessionById(id)).toMatchObject({ date: '2026-07-17', version: 2 });
    expect(await allEvents()).toEqual([]);
  });

  it('a conflicting edit that cleared the duration says it tried to clear it', async () => {
    const id = await aSession({ origin: 'head_coach', duration: 30, version: 2 });

    const result = await edit(id, { input: { ...VALID, duration: null }, expectedVersion: 1 });

    if (result.ok || result.reason !== 'conflict') throw new Error('expected a conflict');
    expect(result.conflict.divergences).toContainEqual({ field: 'duration', current: '30', attempted: null });
  });

  it('refuses to reach across to a session that is not the linked athlete’s', async () => {
    const stranger = await seedAthlete(testDb.db, 'stranger');
    const id = await aSession({ athleteId: stranger, origin: 'head_coach' });

    expect(await edit(id)).toEqual({ ok: false, reason: 'wrong-athlete' });
    expect(await sessionById(id)).toMatchObject({ version: 1 });
  });

  it('refuses to edit a session onto a past week, not just to edit a frozen one', async () => {
    // CodeRabbit on PR #57: the stored row is live, the *target* week is over.
    // Landing there would leave a row nobody could edit, delete or move again.
    const id = await aSession({ origin: 'head_coach', date: '2026-07-16' });

    expect(await edit(id, { input: { ...VALID, date: '2026-07-10' } })).toEqual({ ok: false, reason: 'frozen' });
    expect(await sessionById(id)).toMatchObject({ date: '2026-07-16', version: 1 });
  });
});

describe('deletePrescribedSession — same content tier', () => {
  it('deletes a plan session and records what was removed, by whom', async () => {
    const id = await aSession({ origin: 'head_coach', date: '2026-07-17' });

    expect(await remove(id)).toEqual({ ok: true, sessionId: id });

    expect(await allSessions()).toEqual([]);
    expect(await eventsOf('session_deleted')).toEqual([
      expect.objectContaining({
        athleteId: ATHLETE,
        actorType: 'head_coach',
        actorId: COACH,
        payload: { sessionId: id, date: '2026-07-17', origin: 'head_coach' },
      }),
    ]);
  });

  it('refuses to delete an Athlete Session', async () => {
    const id = await aSession({ origin: 'athlete' });
    expect(reasonOf(await remove(id))).toBe('forbidden-origin');
    expect(await allSessions()).toHaveLength(1);
  });

  it('refuses without an active link', async () => {
    getActiveLink.mockResolvedValue(undefined);
    const id = await aSession({ origin: 'head_coach' });

    expect(reasonOf(await remove(id))).toBe('not-linked');
    expect(await allSessions()).toHaveLength(1);
  });

  it('returns not-found when the session does not exist', async () => {
    expect(reasonOf(await remove('00000000-0000-4000-8000-000000000000'))).toBe('not-found');
  });

  it('refuses a delete the athlete overtook, and keeps the session', async () => {
    const id = await aSession({ origin: 'head_coach', version: 2 });
    expect(reasonOf(await remove(id, { expectedVersion: 1 }))).toBe('conflict');
    expect(await allSessions()).toHaveLength(1);
    expect(await allEvents()).toEqual([]);
  });
});

describe('moveSessionAsHeadCoach — the Head Coach re-places a session', () => {
  // Placement became shared on 2026-08-21 (ADR 0003 amendment). The Move rules
  // are not re-implemented here — they are proven in session-move.test.ts. What
  // this covers is the gate around them.
  const MOVE_TODAY = '2026-07-15';
  const move = (sessionId: string, targetDate = '2026-07-18') =>
    moveSessionAsHeadCoach({ headCoachId: COACH, athleteId: ATHLETE, sessionId, targetDate, today: MOVE_TODAY, expectedVersion: 1 });

  it('moves a coach-authored session and records the move as the Head Coach’s', async () => {
    const id = await aSession({ origin: 'coach', date: '2026-07-16' });

    expect(await move(id)).toEqual({ ok: true, version: 2 });

    expect(await sessionById(id)).toMatchObject({ date: '2026-07-18', version: 2 });
    expect(await eventsOf('session_moved')).toEqual([
      expect.objectContaining({ athleteId: ATHLETE, actorType: 'head_coach', actorId: COACH }),
    ]);
  });

  it('refuses a coach with no active link, and moves nothing', async () => {
    getActiveLink.mockResolvedValue(undefined);
    const id = await aSession({ origin: 'coach', date: '2026-07-16' });

    expect(reasonOf(await move(id))).toBe('not-linked');
    expect(await sessionById(id)).toMatchObject({ date: '2026-07-16', version: 1 });
  });

  it('refuses an Athlete Session, which is still the athlete’s territory', async () => {
    // The placement rule was reversed; "may only view Athlete Sessions" was not.
    const id = await aSession({ origin: 'athlete', date: '2026-07-16' });

    expect((await move(id)).ok).toBe(false);
    expect(await sessionById(id)).toMatchObject({ date: '2026-07-16', version: 1 });
  });

  it('bounces a malformed target date before asking about the link', async () => {
    // The date is the coach's own input error; it is answered first, whoever asks.
    getActiveLink.mockResolvedValue(undefined);
    const id = await aSession({ origin: 'coach', date: '2026-07-16' });

    expect(reasonOf(await move(id, 'tomorrow-ish'))).toBe('bounce');
  });

  it('bounces a malformed target date, and moves nothing', async () => {
    const id = await aSession({ origin: 'coach', date: '2026-07-16' });

    expect(reasonOf(await move(id, 'tomorrow-ish'))).toBe('bounce');
    expect(await sessionById(id)).toMatchObject({ date: '2026-07-16' });
  });
});

describe('the record is immutable for the Head Coach too', () => {
  /**
   * `loadEditableSession` once refused only not-found, wrong-athlete and
   * forbidden-origin, so a *completed* coach-authored session could be
   * rewritten or removed. Hidden until 2026-09-04 by a list filter on the
   * coach's editing surface — protection purely client-side, which ADR 0006
   * forbids.
   */
  it('refuses to edit a completed session', async () => {
    const id = await aSession({ status: 'completed' });
    expect(reasonOf(await edit(id))).toBe('frozen');
    expect(await sessionById(id)).toMatchObject({ version: 1 });
  });

  it('refuses to delete a completed session', async () => {
    const id = await aSession({ status: 'completed' });
    expect(reasonOf(await remove(id))).toBe('frozen');
    expect(await allSessions()).toHaveLength(1);
  });

  it('refuses to edit anything in a past week, whatever its status', async () => {
    // Week Rebalancing has already absorbed the missed load (ADR 0002), so last
    // week is closed even for a session that never happened.
    const id = await aSession({ date: '2026-07-08' });
    expect(reasonOf(await edit(id))).toBe('frozen');
  });

  it('refuses to delete anything in a past week', async () => {
    const id = await aSession({ date: '2026-07-08' });
    expect(reasonOf(await remove(id))).toBe('frozen');
  });

  it('still edits an ordinary planned session in the current week, and a future one', async () => {
    expect((await edit(await aSession())).ok).toBe(true);
    expect((await edit(await aSession({ date: '2026-07-18' }))).ok).toBe(true);
  });

  it('says "not yours" before it says "too late"', async () => {
    // Origin is the more fundamental answer, and the ordering `drawer-policy.ts`
    // gives the coach on screen.
    const id = await aSession({ origin: 'athlete', status: 'completed' });
    expect(reasonOf(await edit(id))).toBe('forbidden-origin');
  });

  it('refuses exactly what isFrozen calls frozen, and nothing else', async () => {
    // The rule lives in move-rules.ts and Session Move asks the same function,
    // so "a completed session is frozen" cannot mean one thing for placement and
    // another for content.
    const { isFrozen } = await import('@/features/session/move-rules');

    for (const date of ['2026-07-08', TODAY, '2026-07-18']) {
      for (const status of ['planned', 'completed', 'skipped', 'unavailable']) {
        const id = await aSession({ date, status });
        expect(reasonOf(await edit(id)) === 'frozen', `${date}/${status}`).toBe(isFrozen({ date, status }, TODAY));
      }
    }
  });
});
