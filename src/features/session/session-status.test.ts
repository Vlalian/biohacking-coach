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
});
