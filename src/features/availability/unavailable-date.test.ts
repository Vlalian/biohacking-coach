import { describe, it, expect, vi, beforeEach } from 'vitest';

// The DB is mocked so the authority logic can be tested without Postgres: the
// sessions select returns a fixed day, and batch records whether a paired write
// happened atomically.
const selectWhere = vi.fn();
const batch = vi.fn().mockResolvedValue(undefined);
const onConflictDoNothing = vi.fn(() => ({}));
const insertValues = vi.fn(() => ({ onConflictDoNothing }));
const updateWhere = vi.fn(() => ({}));
const updateSet = vi.fn(() => ({ where: updateWhere }));
const deleteWhere = vi.fn(() => ({}));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
    delete: () => ({ where: deleteWhere }),
    batch,
  }),
}));

const { markUnavailableDate, clearUnavailableDate } = await import(
  './unavailable-date'
);

const TODAY = '2026-07-16';
const OWNER = 'athlete_owner';

beforeEach(() => {
  selectWhere.mockReset();
  batch.mockClear();
  insertValues.mockClear();
  onConflictDoNothing.mockClear();
  updateSet.mockClear();
  deleteWhere.mockClear();
});

describe('markUnavailableDate', () => {
  it('parks the day’s training and writes the date row in one batch', async () => {
    selectWhere.mockResolvedValue([
      { id: 'ride', isTraining: true, status: 'planned' },
      { id: 'done', isTraining: true, status: 'completed' },
      { id: 'mobility', isTraining: false, status: 'planned' },
    ]);

    const result = await markUnavailableDate({
      athleteId: OWNER,
      date: '2026-07-18',
      today: TODAY,
    });

    expect(result).toEqual({ ok: true });
    // One atomic batch: the date row and the park flips, both or neither.
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
    expect(insertValues).toHaveBeenCalledWith({ athleteId: OWNER, date: '2026-07-18' });
    // Only the parkable training flips — completed and non-training are untouched.
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable', parked: true }),
    );
  });

  it('never changes a session’s day — parking is in place, not a move', async () => {
    selectWhere.mockResolvedValue([
      { id: 'ride', isTraining: true, status: 'planned' },
    ]);

    await markUnavailableDate({ athleteId: OWNER, date: '2026-07-18', today: TODAY });

    // The Move rules stay the authority on placement: Displacement touches status
    // and parked, never date, so no placement is ever produced.
    expect(updateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ date: expect.anything() }),
    );
  });

  it('writes only the date row when nothing is parkable', async () => {
    selectWhere.mockResolvedValue([
      { id: 'done', isTraining: true, status: 'completed' },
      { id: 'mobility', isTraining: false, status: 'planned' },
    ]);

    const result = await markUnavailableDate({
      athleteId: OWNER,
      date: '2026-07-18',
      today: TODAY,
    });

    expect(result).toEqual({ ok: true });
    expect(insertValues).toHaveBeenCalledWith({ athleteId: OWNER, date: '2026-07-18' });
    expect(batch).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('refuses a past date and writes nothing', async () => {
    const result = await markUnavailableDate({
      athleteId: OWNER,
      date: '2026-07-15',
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'past-date' });
    expect(selectWhere).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('clearUnavailableDate', () => {
  it('restores the day’s parked sessions on a future day, in one batch', async () => {
    selectWhere.mockResolvedValue([
      { id: 'ride', parked: true },
      { id: 'live', parked: false },
    ]);

    const result = await clearUnavailableDate({
      athleteId: OWNER,
      date: '2026-07-18',
      today: TODAY,
    });

    expect(result).toEqual({ ok: true });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'planned', parked: false }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ date: expect.anything() }),
    );
  });

  it('leaves parked sessions on a past day — the record is immutable', async () => {
    selectWhere.mockResolvedValue([{ id: 'ride', parked: true }]);

    const result = await clearUnavailableDate({
      athleteId: OWNER,
      date: '2026-07-15',
      today: TODAY,
    });

    expect(result).toEqual({ ok: true });
    // The date row still goes; only the restore is withheld.
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(batch).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });
});
