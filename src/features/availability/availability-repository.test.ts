import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { unavailableDates } from '@/db/schema';

// Spy the query builder so the athlete-scoping rule can be asserted directly:
// the filter must key on unavailable_dates.athlete_id with the id passed in.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, eq: vi.fn(actual.eq), asc: vi.fn(actual.asc) };
});

const orderBy = vi.fn();
const where = vi.fn(() => ({ orderBy }));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where }) }),
  }),
}));

const { getUnavailableDates } = await import('./availability-repository');

describe('getUnavailableDates', () => {
  beforeEach(() => {
    orderBy.mockReset();
    where.mockClear();
    vi.mocked(eq).mockClear();
  });

  it('returns the athlete’s dates as a plain sorted list of keys', async () => {
    orderBy.mockResolvedValue([{ date: '2026-07-18' }, { date: '2026-07-20' }]);

    const result = await getUnavailableDates('athlete_1');

    expect(result).toEqual(['2026-07-18', '2026-07-20']);
  });

  it('scopes the query to the athlete by athlete_id', async () => {
    orderBy.mockResolvedValue([]);

    await getUnavailableDates('athlete_1');

    // The one filter is unavailable_dates.athlete_id = the caller's id — no shape
    // of this call returns another athlete's days (ADR 0006).
    expect(where).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith(unavailableDates.athleteId, 'athlete_1');
  });

  it('returns an empty list when the athlete has no unavailable dates', async () => {
    orderBy.mockResolvedValue([]);

    expect(await getUnavailableDates('athlete_1')).toEqual([]);
  });
});
