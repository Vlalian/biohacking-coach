import { describe, it, expect, vi, beforeEach } from 'vitest';

// Two select shapes are exercised: a plain count query (awaited directly, no
// .limit) and an ownership lookup (.limit(1)). The mocked `where()` result is
// both thenable (for the direct await) and carries `.limit` (for the lookup).
const limit = vi.fn();
const countWhere = vi.fn();
const batch = vi.fn().mockResolvedValue(undefined);
const updateWhere = vi.fn(() => ({}));
const updateSet = vi.fn(() => ({ where: updateWhere }));
const deleteWhere = vi.fn(() => ({}));
const insertReturning = vi.fn();
const insertValues = vi.fn(() => ({
  returning: insertReturning,
  then: (resolve: (v: undefined) => void) => resolve(undefined),
}));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit,
          then: (resolve: (v: unknown) => void) => resolve(countWhere()),
        }),
      }),
    }),
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
    delete: () => ({ where: deleteWhere }),
    batch,
  }),
}));

const { createAthleteSession, updateAthleteSession, deleteAthleteSession } = await import(
  './athlete-session'
);

const TODAY = '2026-07-15';
const OWNER = 'athlete_owner';

beforeEach(() => {
  limit.mockReset();
  countWhere.mockReset();
  batch.mockClear();
  insertValues.mockClear();
  insertReturning.mockReset();
  updateSet.mockClear();
  deleteWhere.mockClear();
});

describe('createAthleteSession', () => {
  it('creates a retro-logged session as completed when the date is today or earlier', async () => {
    insertReturning.mockResolvedValue([{ id: 'new_sess' }]);

    const result = await createAthleteSession({
      athleteId: OWNER,
      date: TODAY,
      type: 'Strength',
      durationMin: 45,
      isTraining: true,
      note: 'gym session',
      today: TODAY,
    });

    expect(result).toEqual({ ok: true, sessionId: 'new_sess' });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: OWNER,
        origin: 'athlete',
        status: 'completed',
      }),
    );
  });

  it('allocates dayOrder inside the INSERT, never from a prior count', async () => {
    // A select-then-insert races: two sessions added to the same day at once
    // both read the same count and collide on dayOrder, which is the column the
    // calendar orders a Double by. Computed in the statement, the second insert
    // sees the first — so the value handed to the insert must be SQL, not a
    // number this process worked out beforehand.
    insertReturning.mockResolvedValue([{ id: 'new_sess' }]);

    await createAthleteSession({
      athleteId: OWNER,
      date: TODAY,
      type: 'Strength',
      durationMin: 45,
      isTraining: true,
      note: null,
      today: TODAY,
    });

    const { dayOrder } = (insertValues.mock.calls as unknown as [{ dayOrder: unknown }][])[0][0];
    expect(typeof dayOrder).not.toBe('number');
    expect(dayOrder).toMatchObject({ queryChunks: expect.anything() });
    expect(countWhere).not.toHaveBeenCalled();
  });

  it('creates a future session as planned', async () => {
    countWhere.mockResolvedValue([{ value: 0 }]);
    insertReturning.mockResolvedValue([{ id: 'new_sess' }]);

    const result = await createAthleteSession({
      athleteId: OWNER,
      date: '2026-08-01',
      type: 'Mobility',
      durationMin: null,
      isTraining: false,
      note: null,
      today: TODAY,
    });

    expect(result).toEqual({ ok: true, sessionId: 'new_sess' });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ status: 'planned' }));
  });

  it('refuses an invalid session type', async () => {
    const result = await createAthleteSession({
      athleteId: OWNER,
      date: TODAY,
      type: 'Yoga',
      durationMin: 30,
      isTraining: true,
      note: null,
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('refuses a non-positive duration', async () => {
    const result = await createAthleteSession({
      athleteId: OWNER,
      date: TODAY,
      type: 'Other',
      durationMin: 0,
      isTraining: true,
      note: null,
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe('updateAthleteSession', () => {
  it("edits the athlete's own session", async () => {
    limit.mockResolvedValue([{ athleteId: OWNER, origin: 'athlete' }]);

    const result = await updateAthleteSession({
      athleteId: OWNER,
      sessionId: 's1',
      type: 'Strength',
      durationMin: 30,
      isTraining: true,
      note: 'updated',
    });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ type: 'Strength' }));
  });

  it('refuses to edit a Coach-planned session — content is read-only', async () => {
    limit.mockResolvedValue([{ athleteId: OWNER, origin: 'coach' }]);

    const result = await updateAthleteSession({
      athleteId: OWNER,
      sessionId: 's1',
      type: 'Strength',
      durationMin: 30,
      isTraining: true,
      note: 'nope',
    });

    expect(result).toEqual({ ok: false, reason: 'not-athlete-authored' });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("refuses another athlete's session", async () => {
    limit.mockResolvedValue([{ athleteId: 'someone_else', origin: 'athlete' }]);

    const result = await updateAthleteSession({
      athleteId: OWNER,
      sessionId: 's1',
      type: 'Strength',
      durationMin: 30,
      isTraining: true,
      note: null,
    });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(updateSet).not.toHaveBeenCalled();
  });
});

describe('deleteAthleteSession', () => {
  it("deletes the athlete's own session", async () => {
    limit.mockResolvedValue([{ athleteId: OWNER, origin: 'athlete' }]);

    const result = await deleteAthleteSession({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: true });
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('deletes a completed one too — the athlete can undo an accepted import', async () => {
    // An accepted Detected Activity with no Week Plan match is written as a
    // retro-logged Athlete Session, already completed (showable-version/14).
    // Frozenness governs *moving and editing* the record, not disowning an
    // entry the athlete put there — otherwise a wrong file is permanent.
    limit.mockResolvedValue([{ athleteId: OWNER, origin: 'athlete', status: 'completed' }]);

    const result = await deleteAthleteSession({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: true });
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('refuses to delete a Coach-planned session', async () => {
    limit.mockResolvedValue([{ athleteId: OWNER, origin: 'coach' }]);

    const result = await deleteAthleteSession({ athleteId: OWNER, sessionId: 's1' });

    expect(result).toEqual({ ok: false, reason: 'not-athlete-authored' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('returns not-found when the session does not exist', async () => {
    limit.mockResolvedValue([]);

    const result = await deleteAthleteSession({ athleteId: OWNER, sessionId: 'missing' });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(batch).not.toHaveBeenCalled();
  });
});
