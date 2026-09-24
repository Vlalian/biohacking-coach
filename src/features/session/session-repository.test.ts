import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq, asc, gte, inArray, lt } from 'drizzle-orm';
import { sessions } from '@/db/schema';
import type { SessionRow } from '@/db/schema';

// Spy the query builders so the athlete-scoping rule can be asserted directly:
// the filter must key on sessions.athlete_id with the id the caller passed.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: vi.fn(actual.eq),
    asc: vi.fn(actual.asc),
    inArray: vi.fn(actual.inArray),
    gte: vi.fn(actual.gte),
    lt: vi.fn(actual.lt),
  };
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

const { getArithmeticSessionsForWeek, getSessionsForAthlete, getSessionsInRange, replaceCoachPlanForDateRange, insertArithmeticSessions } = await import(
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
    parkedByDate: null,
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

  it('deletes only this athlete’s own Coach-authored and arithmetic sessions', async () => {
    await replaceCoachPlanForDateRange('athlete_1', '2026-08-17', '2026-08-23', []);

    expect(eq).toHaveBeenCalledWith(sessions.athleteId, 'athlete_1');
    // A Head Coach prescription is not the Coach's to replace, and this clause
    // is the only thing protecting it. The structure's own rows are the
    // Coach's to replace, though — that is what an accepted week does to them
    // (`training-architecture/34`).
    expect(inArray).toHaveBeenCalledWith(sessions.origin, ['coach', 'arithmetic']);
    expect(eq).not.toHaveBeenCalledWith(sessions.origin, 'coach');
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

describe('insertArithmeticSessions — the structure writes its own rows (training-architecture/34)', () => {
  const arith = {
    date: '2026-10-11',
    sport: 'bike' as const,
    type: 'Endurance' as const,
    durationMinutes: 144,
    zone: 'Z2',
    title: 'Long ride',
    note: null,
  };

  it('inserts every row as a planned session of origin arithmetic, carrying its sport and title', async () => {
    await insertArithmeticSessions('athlete_1', [arith]);

    expect(insertValues).toHaveBeenCalledWith([
      {
        athleteId: 'athlete_1',
        date: '2026-10-11',
        origin: 'arithmetic',
        status: 'planned',
        sport: 'bike',
        type: 'Endurance',
        duration: 144,
        zone: 'Z2',
        title: 'Long ride',
        note: null,
        isTraining: true,
      },
    ]);
  });

  it('writes nothing at all when there are no rows', async () => {
    insertValues.mockClear();
    await insertArithmeticSessions('athlete_1', []);
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe('getArithmeticSessionsForWeek — the baseline the Coach adjusts (training-architecture/34)', () => {
  beforeEach(() => {
    orderBy.mockReset();
    where.mockClear();
    vi.mocked(eq).mockClear();
    vi.mocked(asc).mockClear();
  });

  it('asks only for this athlete’s planned arithmetic rows, in the week’s order', async () => {
    orderBy.mockResolvedValue([]);

    await getArithmeticSessionsForWeek('athlete_7', '2026-10-05');

    expect(eq).toHaveBeenCalledWith(sessions.athleteId, 'athlete_7');
    // A session the athlete already did is history, not a baseline; a session
    // the Coach wrote is not the structure's to hand back as its own.
    expect(eq).toHaveBeenCalledWith(sessions.origin, 'arithmetic');
    expect(eq).toHaveBeenCalledWith(sessions.status, 'planned');
    expect(asc).toHaveBeenCalledWith(sessions.date);
    expect(asc).toHaveBeenCalledWith(sessions.dayOrder);
  });

  it('projects the prompt’s fields and nothing else, with a missing sport or title as an empty string', async () => {
    orderBy.mockResolvedValue([
      row({ date: '2026-10-06', sport: 'bike', type: 'Endurance', duration: 90, zone: 'Z2', title: 'Easy ride' }),
      row({ date: '2026-10-07', sport: null, type: 'Tempo', duration: null, zone: null, title: null }),
    ]);

    const result = await getArithmeticSessionsForWeek('athlete_1', '2026-10-05');

    expect(result[0]).toEqual({
      date: '2026-10-06',
      sport: 'bike',
      type: 'Endurance',
      durationMinutes: 90,
      zone: 'Z2',
      title: 'Easy ride',
    });
    expect(result[1]).toEqual({
      date: '2026-10-07',
      sport: '',
      type: 'Tempo',
      durationMinutes: null,
      zone: null,
      title: '',
    });
  });
});

describe('getSessionsInRange — the weeks before a draft (training-architecture/44)', () => {
  beforeEach(() => {
    orderBy.mockReset();
    vi.mocked(eq).mockClear();
    vi.mocked(asc).mockClear();
    vi.mocked(gte).mockClear();
    vi.mocked(lt).mockClear();
  });

  it('reads one athlete’s sessions from the first day up to, not including, the last, in calendar order', async () => {
    orderBy.mockResolvedValue([row({ date: '2026-08-25', status: 'skipped' })]);

    const result = await getSessionsInRange('athlete_9', '2026-08-24', '2026-09-21');

    expect(eq).toHaveBeenCalledWith(sessions.athleteId, 'athlete_9');
    expect(gte).toHaveBeenCalledWith(sessions.date, '2026-08-24');
    // Exclusive: the drafted week itself is not history.
    expect(lt).toHaveBeenCalledWith(sessions.date, '2026-09-21');
    expect(asc).toHaveBeenCalledWith(sessions.date);
    expect(asc).toHaveBeenCalledWith(sessions.dayOrder);
    expect(result).toMatchObject([{ date: '2026-08-25', status: 'skipped' }]);
  });
});
