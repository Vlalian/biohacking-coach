import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boundPairs } from '@/test/drizzle-bound-pairs';

/**
 * The provenance of a parked session, end to end.
 *
 * Two flows park a session in place: marking the whole day unavailable, and
 * marking that one session unavailable from its drawer. They used to write
 * identical rows, so clearing the day restored both — the athlete's own
 * per-session decision was undone by a different decision, and nothing told
 * them (code-health issue 12). The fix is a column that records *why* a row
 * was parked, and this file holds the sequence that column exists for.
 *
 * The database is a small in-memory table that applies the statements the two
 * repositories actually build: a row is matched by the `[column, value]` pairs
 * bound into its WHERE, and updated by its SET. That is deliberately not a
 * mock of the modules' internals — it runs the real SQL shape, minus Postgres,
 * so the assertion is about the end state a real database would hold.
 */

type Row = Record<string, unknown>;
const rows: Row[] = [];

const columnOf = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function matching(condition: unknown): Row[] {
  const pairs = boundPairs(condition);
  return rows.filter((row) => pairs.every(([column, value]) => row[column] === value));
}

/** A statement that runs when awaited directly, via `.returning()`, or in a batch. */
function statement<T>(run: () => T) {
  return { run, returning: async () => run() };
}

const noop = statement(() => undefined);

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (condition: unknown) => ({ limit: async () => matching(condition) }),
      }),
    }),
    update: () => ({
      set: (values: Row) => ({
        where: (condition: unknown) =>
          statement(() => {
            const hit = matching(condition);
            for (const row of hit) {
              for (const [key, value] of Object.entries(values)) row[columnOf(key)] = value;
            }
            return hit.map((row) => ({ id: row.id }));
          }),
      }),
    }),
    insert: () => ({ values: () => ({ ...noop, onConflictDoNothing: () => noop }) }),
    delete: () => ({ where: () => noop }),
    batch: async (statements: Array<{ run: () => unknown }>) => {
      for (const s of statements) s.run();
    },
  }),
}));

const { markUnavailableDate, clearUnavailableDate } = await import('./unavailable-date');
const { toggleUnavailableSession } = await import('../session/session-status');

const TODAY = '2026-07-16';
const DAY = '2026-07-18';
const OWNER = 'athlete_owner';

function plannedRide(id: string): Row {
  return {
    id,
    athlete_id: OWNER,
    date: DAY,
    status: 'planned',
    parked: false,
    parked_by_date: null,
    is_training: true,
    // `getSessionAuthority` selects camelCase fields; the row carries both
    // spellings so one table serves the select and the WHERE alike.
    athleteId: OWNER,
  };
}

beforeEach(() => {
  rows.length = 0;
});

describe('parking provenance', () => {
  // Issue 12's acceptance criterion, as the exact sequence it names.
  it('a session the athlete marked unavailable stays unavailable when its day is marked and then cleared', async () => {
    rows.push(plannedRide('ride'), plannedRide('swim'));

    expect(
      await toggleUnavailableSession({ athleteId: OWNER, sessionId: 'ride', today: TODAY }),
    ).toEqual({ ok: true });
    expect(await markUnavailableDate({ athleteId: OWNER, date: DAY, today: TODAY })).toEqual({
      ok: true,
    });
    expect(await clearUnavailableDate({ athleteId: OWNER, date: DAY, today: TODAY })).toEqual({
      ok: true,
    });

    const [ride, swim] = rows;
    // The per-session decision survives the day's round trip…
    expect(ride).toMatchObject({ status: 'unavailable', parked: true });
    // …and the day's own parking is still undone by clearing the day.
    expect(swim).toMatchObject({ status: 'planned', parked: false });
  });
});
