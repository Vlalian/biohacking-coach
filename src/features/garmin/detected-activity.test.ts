import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mirrors session-status.test.ts's mock shape. `limit` serves both reads — the
// proposal and, when there is a match, the session it points at — so a test
// queues them in call order.
const limit = vi.fn();
const batch = vi.fn().mockResolvedValue(undefined);
// The guarded update ends in `.returning()`, and what it returns is the whole
// point: an empty array means the WHERE matched nothing. Before that existed,
// `updateWhere` swallowed its predicate and returned `{}`, so every test here
// passed whether or not production's WHERE excluded the row it was aiming at —
// which is exactly how a `status = 'planned'` guard survived under tests that
// claimed to cover skipped and displaced sessions.
const updateReturning = vi.fn(async () => [{ id: 'planned_1' }] as { id: string }[]);
const updateWhere = vi.fn(() => ({ returning: updateReturning }));
const updateSet = vi.fn((set: Record<string, unknown>) => ({ where: updateWhere, set }));
const onConflictDoUpdate = vi.fn(() => ({}));
const insertValues = vi.fn((row: Record<string, unknown>) => ({ onConflictDoUpdate, row }));
const deleteWhere = vi.fn(() => ({}));
const eventLimit = vi.fn();
// Two queries share the `.where().orderBy()` chain and end differently: the
// pending list awaits it, the event lookup calls `.limit()` on it. So orderBy
// returns a thenable that also carries `limit`.
const listRows: { current: Record<string, unknown>[] } = { current: [] };
const orderBy = vi.fn(() =>
  Object.assign(Promise.resolve(listRows.current), { limit: eventLimit }),
);
const getSessionsOnDates = vi.fn(async () => [] as Record<string, unknown>[]);

vi.mock('@/features/session/session-repository', () => ({ getSessionsOnDates }));
vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit, orderBy }) }) }),
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
/** Accepting with no chosen session — "add it to my week". */
const AS_NEW = { targetSessionId: null, ...RATING };
/** Accepting onto the session the athlete picked. */
const ONTO_PLANNED = { targetSessionId: 'planned_1', ...RATING };

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
  updateWhere.mockClear();
  // Default: the guarded update found its row. A test that cares about the
  // no-op says so explicitly.
  updateReturning.mockReset().mockResolvedValue([{ id: 'planned_1' }]);
  insertValues.mockClear();
  deleteWhere.mockClear();
  eventLimit.mockReset();
  orderBy.mockClear();
  listRows.current = [];
  getSessionsOnDates.mockReset().mockResolvedValue([]);
  // Unqueued reads answer "nothing there" rather than undefined, so a test
  // only has to say what it actually cares about.
  limit.mockResolvedValue([]);
});

describe('acceptDetectedActivity — the rating is the commit', () => {
  it('completes the matched Planned Session in place, leaving one entry on the day', async () => {
    limit
      .mockResolvedValueOnce([proposal({ matchedSessionId: 'planned_1' })])
      .mockResolvedValueOnce([plannedSession()]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...ONTO_PLANNED,
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
      ...AS_NEW,
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
      // A retro-logged activity is training and has to count as such — it is
      // the reason the athlete uploaded the file. Asserted because nothing else
      // here looked at it: a mutant flipping it to false survived the suite.
      isTraining: true,
    });
  });

  it('completes a session the athlete had skipped, because they say they did it', async () => {
    // Wider than what the matcher may claim on its own: the machine never
    // proposes a skipped session, but the athlete may point an activity at one
    // — "I skipped it in the app and then did it" — and the file is evidence.
    limit
      .mockResolvedValueOnce([proposal()])
      .mockResolvedValueOnce([plannedSession({ status: 'skipped' })]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...ONTO_PLANNED,
    });

    expect(result).toEqual({ ok: true, sessionId: 'planned_1' });
    expect(updated()).toMatchObject({ status: 'completed' });
  });

  it('completes a session a Rest day had displaced, and unparks it', async () => {
    limit
      .mockResolvedValueOnce([proposal()])
      .mockResolvedValueOnce([plannedSession({ status: 'unavailable', parked: true })]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...ONTO_PLANNED });

    expect(updated()).toMatchObject({ status: 'completed', parked: false });
  });

  // The two tests above assert what the update SET. Neither could fail while
  // the update matched no row, because nothing observed the row count — so a
  // WHERE that excluded every skipped and displaced session passed them both.
  // These two watch the outcome instead of the payload.
  it('abandons everything when the guarded update matches no row', async () => {
    limit
      .mockResolvedValueOnce([proposal()])
      .mockResolvedValueOnce([plannedSession({ status: 'skipped' })]);
    // The target moved between the read and the write — someone completed it.
    updateReturning.mockResolvedValue([]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...ONTO_PLANNED,
    });

    expect(result).toEqual({ ok: false, reason: 'target-changed' });
  });

  it('leaves the proposal in place when the update matches no row, so it can be decided again', async () => {
    limit
      .mockResolvedValueOnce([proposal()])
      .mockResolvedValueOnce([plannedSession({ status: 'skipped' })]);
    updateReturning.mockResolvedValue([]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...ONTO_PLANNED });

    // The heart of showable-version/14: reporting success while the activity
    // disappears is the harm. Nothing dependent may run — no streams, no import
    // event, and above all no delete of the proposal the athlete would need to
    // try again.
    expect(batch).not.toHaveBeenCalled();
    expect(deleteWhere).not.toHaveBeenCalled();
    expect(written()).toEqual([]);
  });

  it('refuses a chosen session that is already completed', async () => {
    // The one thing neither the matcher nor the athlete may overwrite: a
    // second activity on the same day is a Double, not an edit of the record.
    limit
      .mockResolvedValueOnce([proposal()])
      .mockResolvedValueOnce([plannedSession({ status: 'completed' })]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...ONTO_PLANNED,
    });

    expect(result).toEqual({ ok: false, reason: 'bad-target' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses a chosen session rather than quietly adding a new one', async () => {
    // Silently doing something else to the athlete's calendar is the class of
    // behaviour this whole ticket is about.
    limit
      .mockResolvedValueOnce([proposal()])
      .mockResolvedValueOnce([plannedSession({ date: '2026-07-16' })]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...ONTO_PLANNED,
    });

    expect(result).toEqual({ ok: false, reason: 'bad-target' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("will not complete another athlete's session", async () => {
    // The chosen id arrives from the browser, so it is a claim, not a fact.
    limit
      .mockResolvedValueOnce([proposal()])
      .mockResolvedValueOnce([plannedSession({ athleteId: 'someone_else' })]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...ONTO_PLANNED,
    });

    expect(result).toEqual({ ok: false, reason: 'bad-target' });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('records everything the undo will need to put things back', async () => {
    // Three things an in-place completion destroys and nothing else remembers:
    // the planned duration (the device's actual one replaces it), and the
    // activity's own type and note, which are never written onto the session.
    // Without them undo can revert the session but cannot rebuild the
    // proposal, and the athlete has to upload the file again.
    limit
      .mockResolvedValueOnce([
        proposal({ matchedSessionId: 'planned_1', type: 'Endurance', note: 'Imported from Garmin' }),
      ])
      .mockResolvedValueOnce([plannedSession({ duration: 75 })]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...ONTO_PLANNED });

    expect(written().find((w) => w.type === 'garmin_imported')?.payload).toMatchObject({
      previousDuration: 75,
      activityType: 'Endurance',
      activityNote: 'Imported from Garmin',
    });
  });

  it('removes the proposal and records the event in the same batch as the write', async () => {
    limit.mockResolvedValueOnce([proposal()]);

    await acceptDetectedActivity({ athleteId: OWNER, activityId: 'a1', ...AS_NEW });

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
      targetSessionId: null,
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
      ...AS_NEW,
    });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses a proposal that is not there', async () => {
    limit.mockResolvedValueOnce([]);

    const result = await acceptDetectedActivity({
      athleteId: OWNER,
      activityId: 'a1',
      ...AS_NEW,
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
    eventLimit.mockResolvedValueOnce([
      { type: 'garmin_imported', payload: { sessionId: 's1', previousDuration: 75 } },
    ]);

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

  it('puts the activity back in the pending list instead of discarding it', async () => {
    // Undo means "let me decide this again". Throwing the activity away would
    // make the athlete find the file and upload it a second time.
    limit.mockResolvedValueOnce([
      completedSession({
        date: DAY,
        duration: 90,
        sport: 'running',
        summary: { distanceM: 21000 },
        startTime: new Date('2026-07-15T06:00:00Z'),
      }),
    ]);
    eventLimit.mockResolvedValueOnce([
      {
        type: 'garmin_imported',
        payload: {
          sessionId: 's1',
          previousDuration: 75,
          activityType: 'Endurance',
          activityNote: 'Imported from Garmin',
        },
      },
    ]);
    limit.mockResolvedValueOnce([{ samples: { t: [0, 5400] } }]);

    await undoDetectedImport({ athleteId: OWNER, sessionId: 's1' });

    const restored = written().find((w) => 'samples' in w)!;
    expect(restored).toMatchObject({
      athleteId: OWNER,
      date: DAY,
      // The activity's own type and note, which an in-place completion never
      // wrote onto the session and which only the event log remembers.
      type: 'Endurance',
      note: 'Imported from Garmin',
      sport: 'running',
      duration: 90,
      matchedSessionId: 's1',
    });
    expect((restored.samples as { t: number[] }).t).toEqual([0, 5400]);
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

  it('refuses when the last thing that happened to the session was an undo', async () => {
    // The sequence that made this necessary: import, undo, and then the athlete
    // completes that same Coach-planned session by hand. The guards above all
    // pass — it is `completed`, and a Coach-planned session's origin is not
    // `athlete` — so a lookup that asks only for the newest `garmin_imported`
    // still finds the old one and would reset an ordinary completion, putting a
    // stale proposal back from a payload describing a file already dealt with.
    limit.mockResolvedValueOnce([completedSession()]);
    eventLimit.mockResolvedValueOnce([
      { type: 'garmin_import_undone', payload: { sessionId: 's1' } },
    ]);

    const result = await undoDetectedImport({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: false, reason: 'not-imported' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('allows undo again after a re-import, because the import is once more the latest', async () => {
    // The mirror of the test above, so the fix is a state machine rather than a
    // one-way latch: import, undo, re-accept, undo. What happened last decides.
    limit.mockResolvedValueOnce([completedSession()]);
    eventLimit.mockResolvedValueOnce([
      { type: 'garmin_imported', payload: { sessionId: 's1', previousDuration: 60 } },
    ]);

    const result = await undoDetectedImport({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: true });
    expect(updated()).toMatchObject({ status: 'planned', duration: 60 });
  });
});

describe('listPendingActivities — a choice, not a verdict', () => {
  function pending(over: Record<string, unknown> = {}) {
    return { id: 'a1', date: DAY, type: 'Endurance', sport: 'running', duration: 90, note: null, matchedSessionId: 'planned_1', ...over };
  }
  function onDay(over: Record<string, unknown> = {}) {
    return {
      id: 'planned_1',
      date: DAY,
      type: 'Endurance',
      status: 'planned',
      parked: false,
      dayOrder: 0,
      duration: 75,
      zone: 'Z2',
      ...over,
    };
  }

  it('offers every session on the day, named without a time it does not have', async () => {
    // A morning swim and an evening ride are both Endurance to the matcher —
    // SPORT_MAP types them the same — so the card has to let the athlete say
    // which. A Planned Session carries a date and an order, never a clock
    // time, so the label is type, duration and zone.
    listRows.current = [pending()];
    getSessionsOnDates.mockResolvedValue([
      onDay(),
      onDay({ id: 'planned_2', dayOrder: 1, duration: 120, zone: null }),
    ]);

    const [activity] = await listPendingActivities(OWNER);

    expect(activity.options).toEqual([
      // dayOrder rides along so the card can tell two otherwise identical
      // sessions apart — a Planned Session has no clock time to do it with.
      { id: 'planned_1', type: 'Endurance', status: 'planned', duration: 75, zone: 'Z2', dayOrder: 0 },
      { id: 'planned_2', type: 'Endurance', status: 'planned', duration: 120, zone: null, dayOrder: 1 },
    ]);
    expect(activity.suggestedSessionId).toBe('planned_1');
  });

  it('offers a skipped or displaced session too — the athlete may claim it', async () => {
    listRows.current = [pending({ matchedSessionId: null })];
    getSessionsOnDates.mockResolvedValue([
      onDay({ id: 'skipped_1', status: 'skipped' }),
      onDay({ id: 'parked_1', status: 'unavailable', parked: true }),
    ]);

    const [activity] = await listPendingActivities(OWNER);

    expect(activity.options.map((o) => o.id)).toEqual(['skipped_1', 'parked_1']);
  });

  it('never offers a completed session — that is the record, not a target', async () => {
    listRows.current = [pending({ matchedSessionId: null })];
    getSessionsOnDates.mockResolvedValue([onDay({ status: 'completed' })]);

    const [activity] = await listPendingActivities(OWNER);

    expect(activity.options).toEqual([]);
  });

  it('never offers a session on another day', async () => {
    listRows.current = [pending({ matchedSessionId: null })];
    getSessionsOnDates.mockResolvedValue([onDay({ date: '2026-07-16' })]);

    const [activity] = await listPendingActivities(OWNER);

    expect(activity.options).toEqual([]);
  });

  it('stops suggesting a match the matcher may no longer claim, but still offers it', async () => {
    // Choosable and suggested are different bars. Once the athlete has skipped
    // it, the machine does not get to propose it — but they may still say they
    // did it, so it stays in the list, just not pre-selected.
    listRows.current = [pending()];
    getSessionsOnDates.mockResolvedValue([onDay({ status: 'skipped' })]);

    const [activity] = await listPendingActivities(OWNER);

    expect(activity.suggestedSessionId).toBeNull();
    expect(activity.options.map((o) => o.id)).toEqual(['planned_1']);
  });

  it('reads the plan only for days something was actually uploaded on', async () => {
    listRows.current = [pending(), pending({ id: 'a2', date: '2026-07-16' })];

    await listPendingActivities(OWNER);

    expect(getSessionsOnDates).toHaveBeenCalledWith(OWNER, [DAY, '2026-07-16']);
  });
});
