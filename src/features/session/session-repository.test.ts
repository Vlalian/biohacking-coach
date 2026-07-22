import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { sessions } from '@/db/schema';
import type { SessionRow } from '@/db/schema';

// Spy the query builders so the athlete-scoping rule can be asserted directly:
// the filter must key on sessions.athlete_id with the id the caller passed.
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

const { getSessionsForAthlete } = await import('./session-repository');

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'sess_1',
    athleteId: 'athlete_1',
    date: '2026-07-13',
    type: 'Endurance',
    origin: 'coach',
    status: 'planned',
    parked: false,
    isTraining: true,
    duration: 60,
    zone: 'Zone 2',
    note: 'Easy',
    title: 'Ride',
    dayOrder: 0,
    startTime: null,
    sport: null,
    summary: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    ratedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('getSessionsForAthlete', () => {
  beforeEach(() => {
    orderBy.mockReset();
    where.mockClear();
    vi.mocked(eq).mockClear();
    vi.mocked(asc).mockClear();
  });

  it('scopes the query to the given athlete id', async () => {
    orderBy.mockResolvedValue([]);

    await getSessionsForAthlete('athlete_42');

    // The filter is on the athlete_id column with the caller's id — there is no
    // shape of this query that returns another athlete's rows.
    expect(eq).toHaveBeenCalledWith(sessions.athleteId, 'athlete_42');
  });

  it('orders by date then day_order so a day reads in sequence', async () => {
    orderBy.mockResolvedValue([]);

    await getSessionsForAthlete('athlete_1');

    expect(asc).toHaveBeenCalledWith(sessions.date);
    expect(asc).toHaveBeenCalledWith(sessions.dayOrder);
  });

  it('maps rows to the domain shape in the order returned', async () => {
    orderBy.mockResolvedValue([
      row({ id: 'a', dayOrder: 0 }),
      row({ id: 'b', dayOrder: 1 }),
    ]);

    const result = await getSessionsForAthlete('athlete_1');

    expect(result.map((s) => s.id)).toEqual(['a', 'b']);
    // Domain shape only — the authority and Garmin columns stay in the
    // repository; feedback comes through because the calendar renders and
    // pre-fills it.
    expect(Object.keys(result[0]).sort()).toEqual(
      [
        'date',
        'dayOrder',
        'duration',
        'feedbackBody',
        'feedbackComment',
        'feedbackMind',
        'id',
        'note',
        'status',
        'title',
        'type',
        'zone',
      ].sort(),
    );
  });
});
