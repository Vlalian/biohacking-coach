import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mirrors session-move.test.ts's mock shape: the select returns a fixed row,
// batch records whether a write happened.
const limit = vi.fn();
const batch = vi.fn().mockResolvedValue(undefined);
// The status write is conditional (`... AND status = :expected`) and reports
// what it matched, so the mock's update chain ends in `.returning()`. An empty
// array is how the database says "the row was not in the state you read it in".
const updateReturning = vi.fn().mockResolvedValue([{ id: 's1' }]);
const updateWhere = vi.fn(() => ({ returning: updateReturning }));
const updateSet = vi.fn(() => ({ where: updateWhere }));
const insertValues = vi.fn(() => ({}));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
    update: () => ({ set: updateSet }),
    insert: () => ({ values: insertValues }),
    batch,
  }),
}));

const { completeSession, toggleSkipSession, toggleUnavailableSession } = await import(
  './session-status'
);

const TODAY = '2026-07-15'; // Wednesday
const OWNER = 'athlete_owner';

function row(overrides: Partial<{ athleteId: string; date: string; status: string }> = {}) {
  return { athleteId: OWNER, date: '2026-07-15', status: 'planned', ...overrides };
}

beforeEach(() => {
  limit.mockReset();
  batch.mockClear();
  insertValues.mockClear();
  updateSet.mockClear();
  updateReturning.mockClear().mockResolvedValue([{ id: 's1' }]);
});

describe('completeSession — server authority', () => {
  it('marks a planned session complete and logs the event', async () => {
    limit.mockResolvedValue([row({ date: TODAY })]);

    const result = await completeSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_completed' }),
    );
  });

  it('refuses a session dated after today', async () => {
    limit.mockResolvedValue([row({ date: '2026-07-16' })]);

    const result = await completeSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'future' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses an already-completed session — frozen', async () => {
    limit.mockResolvedValue([row({ date: TODAY, status: 'completed' })]);

    const result = await completeSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'frozen' });
    expect(batch).not.toHaveBeenCalled();
  });

  it("refuses another athlete's session", async () => {
    limit.mockResolvedValue([row({ athleteId: 'someone_else', date: TODAY })]);

    const result = await completeSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('returns not-found when the session does not exist', async () => {
    limit.mockResolvedValue([]);

    const result = await completeSession({ athleteId: OWNER, sessionId: 'missing', today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('toggleSkipSession — server authority', () => {
  it('skips a planned session', async () => {
    limit.mockResolvedValue([row({ status: 'planned' })]);

    const result = await toggleSkipSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_skipped' }),
    );
  });

  it('undoes a skip back to planned', async () => {
    limit.mockResolvedValue([row({ status: 'skipped' })]);

    const result = await toggleSkipSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'planned' }));
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_skip_undone' }),
    );
  });

  it('refuses a completed session — the record is immutable', async () => {
    limit.mockResolvedValue([row({ status: 'completed' })]);

    const result = await toggleSkipSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'frozen' });
    expect(batch).not.toHaveBeenCalled();
  });

  it("refuses another athlete's session", async () => {
    limit.mockResolvedValue([row({ athleteId: 'someone_else' })]);

    const result = await toggleSkipSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(updateSet).not.toHaveBeenCalled();
  });
});

// The write is conditional on the status the session was read in, and it says
// so by reporting what it matched. These pin the conflict path and the event
// the move log gets, which the toggles above only touch in passing.
describe('applying a status transition', () => {
  it('reports a conflict, and logs nothing, when the session changed under the read', async () => {
    limit.mockResolvedValue([row({ status: 'planned' })]);
    // The database found no row in the state the toggle read it in.
    updateReturning.mockResolvedValue([]);

    const result = await toggleSkipSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'conflict' });
    expect(insertValues).not.toHaveBeenCalled();
    // The conflict is only detectable because the write asks for the matched
    // rows back; a `returning()` with nothing selected would report nothing.
    expect(updateReturning).toHaveBeenCalledWith({ id: expect.anything() });
  });

  it('records the event as the athlete’s own act on that session', async () => {
    limit.mockResolvedValue([row({ status: 'planned' })]);

    await toggleSkipSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(insertValues).toHaveBeenCalledWith({
      athleteId: OWNER,
      actorType: 'athlete',
      actorId: OWNER,
      type: 'session_skipped',
      payload: { sessionId: 's1' },
    });
  });
});

describe('toggleUnavailableSession — server authority', () => {
  it('marks a planned session unavailable and parks it', async () => {
    limit.mockResolvedValue([row({ status: 'planned' })]);

    const result = await toggleUnavailableSession({
      athleteId: OWNER,
      sessionId: 's1',
      today: TODAY,
    });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable', parked: true }),
    );
  });

  // The session-level toggle parks a session for the athlete's own reason, so
  // it must never claim the day's: a row it parks carries `parkedByDate` null,
  // which is what keeps clearing the day from restoring it (code-health issue
  // 12). Asserted as the written value, not its absence — a toggle that merely
  // left the column alone would inherit a date from an earlier day-park and
  // reopen the same hole one round trip later.
  it('parks for the athlete’s own reason: parkedByDate is written null, not the day', async () => {
    limit.mockResolvedValue([row({ status: 'planned' })]);

    await toggleUnavailableSession({ athleteId: OWNER, sessionId: 's1', today: TODAY });

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ parkedByDate: null }));
  });

  it('undoes unavailable back to planned and unparks it', async () => {
    limit.mockResolvedValue([row({ status: 'unavailable' })]);

    const result = await toggleUnavailableSession({
      athleteId: OWNER,
      sessionId: 's1',
      today: TODAY,
    });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'planned', parked: false }),
    );
  });

  it('refuses a completed session', async () => {
    limit.mockResolvedValue([row({ status: 'completed' })]);

    const result = await toggleUnavailableSession({
      athleteId: OWNER,
      sessionId: 's1',
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'frozen' });
    expect(batch).not.toHaveBeenCalled();
  });

  it("refuses another athlete's session", async () => {
    limit.mockResolvedValue([row({ athleteId: 'someone_else' })]);

    const result = await toggleUnavailableSession({
      athleteId: OWNER,
      sessionId: 's1',
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(updateSet).not.toHaveBeenCalled();
  });
});
