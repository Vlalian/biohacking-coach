import { describe, it, expect, vi, beforeEach } from 'vitest';

// The DB is mocked so the authority logic can be tested without Postgres: the
// sessions select returns a fixed day, and batch records whether a paired write
// happened atomically.
const selectWhere = vi.fn();
const batch = vi.fn().mockResolvedValue(undefined);
const onConflictDoNothing = vi.fn(() => ({}));
const insertValues = vi.fn(() => ({ onConflictDoNothing }));
const updateWhere = vi.fn((_condition: unknown) => ({}));

/**
 * The literal values bound into a drizzle condition.
 *
 * The selection rule moved out of `displacement.ts` and into the `WHERE`, so the
 * only honest way to hold it is to read the statement the repository actually
 * builds. `queryChunks` is drizzle's own structure; params carry a `.value`.
 */
function boundValues(condition: unknown): unknown[] {
  type Node = { value?: unknown; queryChunks?: unknown[] };
  const out: unknown[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Node;
    if ('value' in n && !('queryChunks' in n)) out.push(n.value);
    for (const chunk of n.queryChunks ?? []) walk(chunk);
  };
  walk(condition);
  return out;
}
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
  updateWhere.mockClear();
  deleteWhere.mockClear();
});

describe('markUnavailableDate', () => {
  it('parks the day’s training and writes the date row in one batch', async () => {
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
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable', parked: true }),
    );
  });

  // The defect this ticket exists for: the day used to be READ, filtered in
  // TypeScript, and only then written. A concurrent clear could land between the
  // two round trips and leave the date row standing over unparked, planned
  // sessions. Deleting the read is what makes the operation atomic, so the test
  // that holds it is “there is no read”.
  it('selects nothing first — the whole operation is one statement', async () => {
    await markUnavailableDate({ athleteId: OWNER, date: '2026-07-18', today: TODAY });

    expect(selectWhere).not.toHaveBeenCalled();
  });

  it('carries the park rule in the WHERE: this athlete, this day, planned training', async () => {
    await markUnavailableDate({ athleteId: OWNER, date: '2026-07-18', today: TODAY });

    const condition = updateWhere.mock.calls[0][0];
    expect(condition).toMatchObject({ queryChunks: expect.anything() });
    // Completed, skipped and non-training sessions are excluded by these two
    // clauses, exactly as `sessionsToPark` used to exclude them in memory.
    expect(boundValues(condition)).toEqual(
      expect.arrayContaining([OWNER, '2026-07-18', true, 'planned']),
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

  // Was “writes only the date row when nothing is parkable”. With the read gone
  // the repository cannot know in advance whether anything matches, and it does
  // not need to: an UPDATE that matches no row is a no-op. The statement is
  // always issued, which is the price of atomicity and a fair one.
  it('issues the same two statements on a day with nothing to park', async () => {
    const result = await markUnavailableDate({
      athleteId: OWNER,
      date: '2026-07-18',
      today: TODAY,
    });

    expect(result).toEqual({ ok: true });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
  });

  it('is idempotent: marking an already-unavailable day changes nothing', async () => {
    await markUnavailableDate({ athleteId: OWNER, date: '2026-07-18', today: TODAY });

    // The (athlete, date) primary key makes the re-insert a no-op, and the
    // update matches nothing because those sessions are already `unavailable`.
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it('refuses a past date and writes nothing', async () => {
    const result = await markUnavailableDate({
      athleteId: OWNER,
      date: '2026-07-15',
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'past-date' });
    expect(insertValues).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });
});

describe('clearUnavailableDate', () => {
  it('restores the day’s parked sessions on a future day, in one batch', async () => {
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

  it('selects nothing first, and carries the restore rule in the WHERE', async () => {
    await clearUnavailableDate({ athleteId: OWNER, date: '2026-07-18', today: TODAY });

    expect(selectWhere).not.toHaveBeenCalled();
    const condition = updateWhere.mock.calls[0][0];
    expect(condition).toMatchObject({ queryChunks: expect.anything() });
    // Only this athlete’s parked sessions on this day come back.
    expect(boundValues(condition)).toEqual(
      expect.arrayContaining([OWNER, '2026-07-18', true]),
    );
  });

  it('clearing a day that was never marked is a no-op, not an error', async () => {
    expect(
      await clearUnavailableDate({ athleteId: OWNER, date: '2026-07-18', today: TODAY }),
    ).toEqual({ ok: true });
  });

  it('leaves parked sessions on a past day — the record is immutable', async () => {
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
