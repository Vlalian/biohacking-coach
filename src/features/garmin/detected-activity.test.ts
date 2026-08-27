import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mirrors session-status.test.ts's mock shape. `limit` serves both reads — the
// proposal and, when there is a match, the session it points at — so a test
// queues them in call order.
const limit = vi.fn();
const batch = vi.fn().mockResolvedValue(undefined);
const updateWhere = vi.fn(() => ({}));
const updateSet = vi.fn((set: Record<string, unknown>) => ({ where: updateWhere, set }));
const onConflictDoUpdate = vi.fn(() => ({}));
const insertValues = vi.fn((row: Record<string, unknown>) => ({ onConflictDoUpdate, row }));
const deleteWhere = vi.fn(() => ({}));
const eventLimit = vi.fn();
const eventOrderBy = vi.fn(() => ({ limit: eventLimit }));
// The pending list ends at `.orderBy()` with no limit, so it awaits directly.
const listOrderBy = vi.fn(async () => [] as Record<string, unknown>[]);

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit, orderBy: eventOrderBy }),
        leftJoin: () => ({ where: () => ({ orderBy: listOrderBy }) }),
      }),
    }),
    update: () => ({ set: updateSet }),
    insert: () => ({ values: insertValues }),
    delete: () => ({ where: deleteWhere }),
    batch,
  }),
}));

const { acceptDetectedActivity, declineDetectedActivity, undoDetectedImport, listPendingActivities } =
  await import('./detected-activity');

const OWNER = 'athlete_owner';
const DAY = '2026-07-15';

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    athleteId: OWNER,
    date: DAY,
    type: 'Endurance',
    sport: 'running',
    duration: 3600,
    note: 'Morning run',
    startTime: new Date('2026-07-15T06:00:00Z'),
    summary: { distance: 10000 },
    samples: { t: [0, 10] },
    matchedSessionId: null,
    ...over,
  };
}

function plannedSession(over: Record<string, unknown> = {}) {
  return { athleteId: OWNER, date: DAY, status: 'planned', parked: false, ...over };
}

const RATING = { body: 3, mind: 4, comment: '  felt fine  ' };

/** Everything handed to `.values()` during the call. */
function written(): Record<string, unknown>[] {
  return insertValues.mock.calls.map((c) => c[0]);
}

/** What the in-place completion set, or undefined if there was no update. */
function updated(): Record<string, unknown> | undefined {
  return updateSet.mock.calls[0]?.[0];
}

beforeEach(() => {
  limit.mockReset();
  batch.mockClear();
  updateSet.mockClear();
  insertValues.mockClear();
  deleteWhere.mockClear();
  eventLimit.mockReset();
  eventOrderBy.mockClear();
  listOrderBy.mockReset().mockResolvedValue([]);
});

describe('acceptDetectedActivity — the rating is the commit', () => {
  it('completes the matched Planned Session in place, leaving one entry on the day', async () => {
    limit
      .mockResolvedValueOnce([proposal({ matchedSessionId: 'planned_1' })])
      .mockResolvedValueOnce([plannedSession()]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...RATING,
    });

    expect(result).toEqual({ ok: true, sessionId: 'planned_1' });
    // Updated, never inserted — a second session beside the planned one is the
    // duplicate showable-version/14 was reported for.
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        duration: 3600,
        sport: 'running',
        feedbackBody: 3,
        feedbackMind: 4,
        feedbackComment: 'felt fine',
      }),
    );
    // The Coach's own content is not overwritten by the device.
    expect(updated()).not.toHaveProperty('note');
    expect(updated()).not.toHaveProperty('zone');
    expect(written().some((w) => w.origin)).toBe(false);
  });

  it("retro-logs an unmatched activity as the athlete's own, so they can delete it", async () => {
    limit.mockResolvedValueOnce([proposal()]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...RATING,
    });

    expect(result.ok).toBe(true);
    expect(updateSet).not.toHaveBeenCalled();

    const session = written().find((w) => w.origin)!;
    expect(session).toMatchObject({
      athleteId: OWNER,
      date: DAY,
      // origin decides every edit/delete guard — 'garmin' is what made a
      // mistaken import permanent.
      origin: 'athlete',
      status: 'completed',
      feedbackBody: 3,
    });
  });

  it('falls back to retro-logging when the match went stale', async () => {
    // The athlete skipped that session between uploading and accepting.
    limit
      .mockResolvedValueOnce([proposal({ matchedSessionId: 'planned_1' })])
      .mockResolvedValueOnce([plannedSession({ status: 'skipped' })]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...RATING });

    expect(updateSet).not.toHaveBeenCalled();
    expect(written().find((w) => w.origin)).toMatchObject({ origin: 'athlete' });
  });

  it('will not complete a session that has since been parked', async () => {
    limit
      .mockResolvedValueOnce([proposal({ matchedSessionId: 'planned_1' })])
      .mockResolvedValueOnce([plannedSession({ parked: true })]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...RATING });

    expect(updateSet).not.toHaveBeenCalled();
  });

  it('will not complete a session that has since been moved to another day', async () => {
    limit
      .mockResolvedValueOnce([proposal({ matchedSessionId: 'planned_1' })])
      .mockResolvedValueOnce([plannedSession({ date: '2026-07-16' })]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...RATING });

    expect(updateSet).not.toHaveBeenCalled();
  });

  it("will not complete another athlete's session", async () => {
    limit
      .mockResolvedValueOnce([proposal({ matchedSessionId: 'planned_1' })])
      .mockResolvedValueOnce([plannedSession({ athleteId: 'someone_else' })]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...RATING });

    expect(updateSet).not.toHaveBeenCalled();
  });

  it('records the duration it overwrote, so the undo has something to restore', async () => {
    // The device's actual duration replaces the planned one, and nothing else
    // remembers the planned figure.
    limit
      .mockResolvedValueOnce([proposal({ matchedSessionId: 'planned_1' })])
      .mockResolvedValueOnce([plannedSession({ duration: 75 })]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...RATING });

    expect(written().find((w) => w.type === 'garmin_imported')?.payload).toMatchObject({
      previousDuration: 75,
    });
  });

  it('removes the proposal and records the event in the same batch as the write', async () => {
    limit.mockResolvedValueOnce([proposal()]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...RATING });

    // One atomic batch: session, streams, event, proposal removal.
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(4);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(written().find((w) => w.type === 'garmin_imported')).toMatchObject({
      athleteId: OWNER,
      actorType: 'athlete',
    });
  });

  it('refuses a rating outside RPE 1-5 and writes nothing', async () => {
    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      body: 9,
      mind: 3,
      comment: null,
    });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(batch).not.toHaveBeenCalled();
    // Refused before the proposal is even read.
    expect(limit).not.toHaveBeenCalled();
  });

  it("refuses another athlete's proposal and writes nothing", async () => {
    limit.mockResolvedValueOnce([proposal({ athleteId: 'someone_else' })]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...RATING,
    });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses a proposal that is not there', async () => {
    limit.mockResolvedValueOnce([]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...RATING,
    });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('declineDetectedActivity — declining leaves the calendar as it was', () => {
  it('deletes the proposal and touches no session', async () => {
    limit.mockResolvedValueOnce([proposal({ matchedSessionId: 'planned_1' })]);

    const result = await declineDetectedActivity({ athleteId: OWNER, activityId: 'a1' });

    expect(result).toEqual({ ok: true });
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    // The matched Planned Session is not read, not updated, not deleted. It was
    // never changed in the first place, which is why declining costs nothing.
    expect(updateSet).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("refuses another athlete's proposal", async () => {
    limit.mockResolvedValueOnce([proposal({ athleteId: 'someone_else' })]);

    const result = await declineDetectedActivity({ athleteId: OWNER, activityId: 'a1' });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(deleteWhere).not.toHaveBeenCalled();
  });
});

describe('undoDetectedImport — the way back from a wrong file', () => {
  function completedSession(over: Record<string, unknown> = {}) {
    return { athleteId: OWNER, status: 'completed', origin: 'coach', ...over };
  }

  it('reverts the session to planned and restores the duration it overwrote', async () => {
    limit.mockResolvedValueOnce([completedSession()]);
    eventLimit.mockResolvedValueOnce([{ payload: { sessionId: 's1', previousDuration: 75 } }]);

    const result = await undoDetectedImport({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: true });
    expect(updated()).toMatchObject({
      status: 'planned',
      // The device data goes, and so does the Reflection — the Reflection was
      // the acceptance.
      duration: 75,
      startTime: null,
      sport: null,
      summary: null,
      feedbackBody: null,
      feedbackMind: null,
      ratedAt: null,
    });
    // The stream row goes with it, and the undo is recorded.
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(written().find((w) => w.type === 'garmin_import_undone')).toBeDefined();
  });

  it('refuses a session the event log does not call an import', async () => {
    // Otherwise this would be a general un-complete button, which the domain
    // model deliberately does not have.
    limit.mockResolvedValueOnce([completedSession()]);
    eventLimit.mockResolvedValueOnce([]);

    const result = await undoDetectedImport({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: false, reason: 'not-imported' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses a retro-logged Athlete Session — delete is its undo', async () => {
    // Reverting one to planned would leave a session on a day the athlete
    // never planned one.
    limit.mockResolvedValueOnce([completedSession({ origin: 'athlete' })]);

    const result = await undoDetectedImport({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: false, reason: 'not-imported' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses a session that is not completed', async () => {
    limit.mockResolvedValueOnce([completedSession({ status: 'planned' })]);

    const result = await undoDetectedImport({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: false, reason: 'not-imported' });
    expect(batch).not.toHaveBeenCalled();
  });

  it("refuses another athlete's session", async () => {
    limit.mockResolvedValueOnce([completedSession({ athleteId: 'someone_else' })]);

    const result = await undoDetectedImport({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('listPendingActivities — the card must describe what will happen', () => {
  function joined(over: Record<string, unknown> = {}) {
    return {
      id: 'a1',
      date: DAY,
      type: 'Endurance',
      sport: 'running',
      duration: 90,
      note: 'Morning run',
      matchedId: 'planned_1',
      matchedType: 'Endurance',
      matchedDuration: 75,
      matchedZone: 'Z2',
      matchedDate: DAY,
      matchedStatus: 'planned',
      matchedParked: false,
      ...over,
    };
  }

  it('names the session it will complete, so a Double day is verifiable', async () => {
    listOrderBy.mockResolvedValue([joined()]);

    const [pending] = await listPendingActivities(OWNER);

    expect(pending.matched).toEqual({
      id: 'planned_1',
      type: 'Endurance',
      duration: 75,
      zone: 'Z2',
    });
  });

  it('drops a match that went stale, because accepting would not complete it', async () => {
    // Same eligibility the accept path applies. A card still promising to
    // complete a skipped, parked or moved session describes something that
    // will not happen, and the athlete cannot tell until it is too late.
    for (const stale of [
      { matchedStatus: 'skipped' },
      { matchedStatus: 'completed' },
      { matchedParked: true },
      { matchedDate: '2026-07-16' },
    ]) {
      listOrderBy.mockResolvedValue([joined(stale)]);

      const [pending] = await listPendingActivities(OWNER);

      expect(pending.matched, JSON.stringify(stale)).toBeNull();
    }
  });

  it('reports no match when the session was deleted out from under it', async () => {
    listOrderBy.mockResolvedValue([
      joined({ matchedId: null, matchedType: null, matchedDate: null, matchedStatus: null }),
    ]);

    const [pending] = await listPendingActivities(OWNER);

    expect(pending.matched).toBeNull();
  });
});
