import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// The mocked-chain shape of `training-block-repository.test.ts`: builder
// methods return the chain, awaiting it resolves the next queued row set, and
// `.where()` arguments are captured so the athlete scoping (ADR 0006) and the
// rated-only filter can be rendered to real SQL and asserted.
let rowsQueue: unknown[][] = [];
let whereArgs: unknown[] = [];
let selectArgs: unknown[] = [];

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  c.from = () => c;
  c.select = (projection: unknown) => {
    selectArgs.push(projection);
    return c;
  };
  c.where = (arg: unknown) => {
    whereArgs.push(arg);
    return c;
  };
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(rowsQueue.shift() ?? []).then(resolve);
  return c;
}

vi.mock('@/db', () => ({ getDb: () => chain() }));

const { getPresenceEvidence, getPresenceStage } = await import('./presence-repository');

const render = (arg: unknown) => new PgDialect().sqlToQuery(arg as SQL);

beforeEach(() => {
  rowsQueue = [];
  whereArgs = [];
  selectArgs = [];
});

describe('getPresenceEvidence', () => {
  it('counts weeks of reflections and check-ins filed, both scoped to the athlete', async () => {
    // Read order: rated session dates, then the check-in count.
    rowsQueue = [
      [{ date: '2026-09-14' }, { date: '2026-09-16' }, { date: '2026-09-22' }],
      [{ n: 2 }],
    ];

    expect(await getPresenceEvidence('athlete_1')).toEqual({ reflectionWeeks: 2, checkIns: 2 });

    // Dates only from the sessions, a count only from the check-ins: nothing
    // wider is read on the way to a stage.
    expect(selectArgs.map((p) => Object.keys(p as object))).toEqual([['date'], ['n']]);

    const [reflections, filed] = whereArgs.map(render);
    expect(reflections.sql).toMatch(/"athlete_id" = \$\d+/);
    expect(reflections.sql).toMatch(/"rated_at" is not null/);
    expect(reflections.params).toEqual(['athlete_1']);
    expect(filed.sql).toMatch(/"athlete_id" = \$\d+/);
    expect(filed.params).toEqual(['athlete_1']);
  });

  it('reads an athlete with nothing as zero on both, not as a missing row', async () => {
    rowsQueue = [[], []];
    expect(await getPresenceEvidence('athlete_1')).toEqual({ reflectionWeeks: 0, checkIns: 0 });
  });
});

describe('getPresenceStage', () => {
  it('turns the evidence into the stage — a single check-in is enough to leave cold start', async () => {
    rowsQueue = [[], [{ n: 1 }]];
    expect(await getPresenceStage('athlete_1')).toBe('building');
  });
});
