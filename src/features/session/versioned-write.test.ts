import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boundPairs } from '@/test/drizzle-bound-pairs';

// Mirrors session-move.test.ts's mock shape: the update's `.returning()` says
// whether the compare-and-set matched.
const updateReturning = vi.fn().mockResolvedValue([{ version: 2 }]);
const updateWhere = vi.fn((_condition: unknown) => ({ returning: updateReturning }));
const updateSet = vi.fn((_values: unknown) => ({ where: updateWhere }));
const insertValues = vi.fn(() => ({}));

vi.mock('@/db', () => ({
  getDb: () => ({
    update: () => ({ set: updateSet }),
    insert: () => ({ values: insertValues }),
  }),
}));

const { casUpdateSession } = await import('./versioned-write');

const OWNER = 'athlete_owner';

beforeEach(() => {
  updateSet.mockClear();
  updateReturning.mockReset().mockResolvedValue([{ version: 2 }]);
});

// Two doors write a session's `date`: a Session Move and the Head Coach's edit
// of a Prescribed Session. Neither refuses a parked session (the calendar
// refuses to *drag* one, but the server is the authority and lets the write
// through), so a session day D parked could land on D2 still naming D — and
// clearing neither day would restore it (clearing D wants `date = D`,
// clearing D2 wants `parked_by_date = D2`). Found by CodeRabbit on PR #77 for
// the move; the review found the coach edit is the same door.
//
// So the carry lives here, under every date write, rather than in each caller:
// a non-null `parked_by_date` follows the session to its new day, null stays
// null. Decided in SQL, not from the row read a statement earlier — a
// day-park does not bump `version`, so the compare-and-set would not catch one
// landing in between.
describe('casUpdateSession — parking provenance follows a date write', () => {
  it('carries a day-parked session’s parked_by_date to the new date', async () => {
    await casUpdateSession({
      athleteId: OWNER,
      sessionId: 's1',
      expectedVersion: 1,
      set: { date: '2026-07-18' },
      attempted: { date: '2026-07-18' },
    });

    const written = updateSet.mock.calls[0][0] as { parkedByDate?: unknown };
    // The value is a CASE over the column, bound to the new day.
    expect(boundPairs(written.parkedByDate)).toEqual([['parked_by_date', '2026-07-18']]);
  });

  it('leaves parked_by_date alone when the date is not written', async () => {
    await casUpdateSession({
      athleteId: OWNER,
      sessionId: 's1',
      expectedVersion: 1,
      set: { title: 'Long ride' },
      attempted: { title: 'Long ride' },
    });

    expect(updateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ parkedByDate: expect.anything() }),
    );
  });
});
