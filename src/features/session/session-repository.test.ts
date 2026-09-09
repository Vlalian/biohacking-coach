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
const deleteWhere = vi.fn(() => ({}));
const insertValues = vi.fn(() => ({}));
const batch = vi.fn((_statements?: unknown[]) => Promise.resolve());

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where }) }),
    delete: () => ({ where: deleteWhere }),
    insert: () => ({ values: insertValues }),
    batch,
  }),
}));

const { getSessionsForAthlete, replaceCoachPlanForDateRange } = await import(
  './session-repository'
);

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
    version: 1,
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
    // Domain shape only — the Garmin columns stay in the repository;
    // feedback comes through because the calendar renders and pre-fills it.
    // `origin`/`isTraining` came in with the Session Drawer's status and
    // Athlete Session actions (edit/delete gating on origin, Double/Rest
    // rules on isTraining). `version` came in with write-conflict detection:
    // nothing renders it, but every editor sends it back so a concurrent
    // write is refused rather than overwritten.
    expect(Object.keys(result[0]).sort()).toEqual(
      [
        'date',
        'dayOrder',
        'duration',
        'feedbackBody',
        'feedbackComment',
        'feedbackMind',
        'id',
        'isTraining',
        'note',
        'origin',
        'parked',
        'status',
        'title',
        'type',
        'version',
        'zone',
      ].sort(),
    );
  });
});


/**
 * What re-planning a week is allowed to delete.
 *
 * Both the Weekly Session and automatic generation (`knowledge-oracle/04a`)
 * write a plan through this function, so its delete predicate decides what an
 * athlete can lose by re-planning. It had no test until 04a, and it was missing
 * a clause.
 *
 * The `eq` spy above makes the assertions column-precise, which is the point: a
 * bag of bound values cannot tell `eq(sessions.origin, 'coach')` from a clause
 * that narrows the wrong column to the same string.
 */
describe('replaceCoachPlanForDateRange', () => {
  beforeEach(() => {
    vi.mocked(eq).mockClear();
    deleteWhere.mockClear();
    insertValues.mockClear();
    batch.mockClear();
  });

  it('spares a Coach session the athlete already completed', async () => {
    // The clause that was missing. Without it, re-planning the week deletes a
    // session the athlete completed today — a record of training that happened,
    // erased by a plan, which is the record mutation ADR 0002 forbids. The
    // ticket claimed this was already guaranteed; it was not.
    await replaceCoachPlanForDateRange('athlete_1', '2026-08-17', '2026-08-23', []);

    expect(eq).toHaveBeenCalledWith(sessions.status, 'planned');
  });

  it('deletes only this athlete’s own Coach-authored sessions', async () => {
    await replaceCoachPlanForDateRange('athlete_1', '2026-08-17', '2026-08-23', []);

    expect(eq).toHaveBeenCalledWith(sessions.athleteId, 'athlete_1');
    // A Head Coach prescription is not the Coach's to replace, and this clause
    // is the only thing protecting it.
    expect(eq).toHaveBeenCalledWith(sessions.origin, 'coach');
  });

  it('clears the range without a batch when the new plan is empty', async () => {
    // An empty plan is legitimate: it clears the range and inserts nothing.
    // Batching a lone delete would wrap one statement in a transaction.
    await replaceCoachPlanForDateRange('athlete_1', '2026-08-17', '2026-08-23', []);

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(batch).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('writes the delete and the insert together, so the range is never half-written', async () => {
    await replaceCoachPlanForDateRange('athlete_1', '2026-08-17', '2026-08-23', [
      row() as never,
    ]);

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
  });
});
