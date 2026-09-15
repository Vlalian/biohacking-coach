import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { TrainingBlockSpec } from './training-blocks';

// The same mocked-chain shape as `narration-repository.test.ts`: builder
// methods return the chain, awaiting it resolves the queued rows, `.where()`
// arguments are captured so the athlete scoping (ADR 0006) can be asserted, and
// raw statements handed to `.execute()` are rendered to real SQL with the
// driver's own dialect. Rendering is the point — every write in this
// repository is one CTE statement whose gate is the whole guarantee, and a
// mocked driver can at least prove the gate is present and parameterised.
let nextRows: unknown[] = [];
let whereArgs: unknown[] = [];
let executed: { sql: string; params: unknown[] }[] = [];
let executeRows: Record<string, unknown>[] = [];
let insertValues: unknown[] = [];
let selectArgs: unknown[] = [];

const CHAIN_METHODS = ['select', 'from', 'orderBy', 'limit', 'insert'] as const;

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const m of CHAIN_METHODS) c[m] = () => c;
  c.select = (projection?: unknown) => {
    selectArgs.push(projection);
    return c;
  };
  c.where = (arg: unknown) => {
    whereArgs.push(arg);
    return c;
  };
  c.values = (v: unknown) => {
    insertValues.push(v);
    return c;
  };
  c.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve(nextRows).then(resolve);
  return c;
}

const execute = vi.fn(async (statement: unknown) => {
  executed.push(new PgDialect().sqlToQuery(statement as SQL));
  return { rows: executeRows };
});

vi.mock('@/db', () => ({
  getDb: () => Object.assign(chain(), { execute }),
}));

const { getBlockSet, insertBlockSet, casUpdateBlockSet, insertBlockEvent, getLatestUnrealisticFlag } =
  await import(
  './training-block-repository'
);

function boundValues(node: unknown, seen = new Set<unknown>()): unknown[] {
  if (node === null || typeof node !== 'object') return [];
  if (seen.has(node)) return [];
  seen.add(node);
  const out: unknown[] = [];
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (value === null) continue;
    if (typeof value === 'object') out.push(...boundValues(value, seen));
    else out.push(value);
  }
  return out;
}

const ATHLETE = '11111111-1111-4111-8111-111111111111';
const RACE = '22222222-2222-4222-8222-222222222222';
const SET_ID = '33333333-3333-4333-8333-333333333333';

const BLOCKS: TrainingBlockSpec[] = [
  { name: 'Build the Volume', endDate: '2026-12-13', authoredBy: 'coach_ai' },
  { name: 'Taper', endDate: '2027-03-14', authoredBy: 'coach_ai' },
];

beforeEach(() => {
  nextRows = [];
  whereArgs = [];
  executed = [];
  executeRows = [];
  insertValues = [];
  selectArgs = [];
  execute.mockClear();
});

describe('getBlockSet — the one set for a race, scoped to the athlete', () => {
  it('filters on both the athlete and the race in the WHERE', async () => {
    await getBlockSet(ATHLETE, RACE);

    const bound = boundValues(whereArgs[0]);
    expect(bound).toContain(ATHLETE);
    expect(bound).toContain(RACE);
  });

  it('returns the row as a record, blocks read out of the jsonb', async () => {
    nextRows = [
      {
        id: SET_ID,
        athleteId: ATHLETE,
        raceId: RACE,
        startDate: '2026-09-14',
        blocks: BLOCKS,
        version: 3,
      },
    ];

    const set = await getBlockSet(ATHLETE, RACE);

    expect(set).toEqual({
      id: SET_ID,
      athleteId: ATHLETE,
      raceId: RACE,
      startDate: '2026-09-14',
      blocks: BLOCKS,
      version: 3,
    });
  });

  it('returns null when the athlete has no set for that race', async () => {
    expect(await getBlockSet(ATHLETE, RACE)).toBeNull();
  });
});

describe('insertBlockSet — one statement, the event gated on the insert winning', () => {
  const params = {
    athleteId: ATHLETE,
    raceId: RACE,
    startDate: '2026-09-14',
    blocks: BLOCKS,
    event: {
      actorType: 'coach_ai' as const,
      actorId: null,
      type: 'blocks_drafted',
      payload: { raceId: RACE, raceName: 'Ironman Copenhagen', blocks: [] },
    },
  };

  it('inserts with ON CONFLICT DO NOTHING on the (athlete, race) index', async () => {
    executeRows = [{ inserted: '1' }];

    await insertBlockSet(params);

    expect(executed).toHaveLength(1);
    const { sql, params: bound } = executed[0];
    expect(sql).toMatch(/insert into "training_block_set"/i);
    expect(sql).toMatch(/on conflict \("athlete_id", ?"race_id"\) do nothing/i);
    expect(bound).toContain(ATHLETE);
    expect(bound).toContain(RACE);
    expect(bound).toContain('2026-09-14');
    expect(bound).toContain(JSON.stringify(BLOCKS));
  });

  it('writes the event in the same statement, only where the insert landed', async () => {
    executeRows = [{ inserted: '1' }];

    await insertBlockSet(params);

    const { sql, params: bound } = executed[0];
    expect(sql).toMatch(/insert into "events"/i);
    // The gate: no row inserted, no event. Not a second statement that runs
    // regardless — the same hole `claimAndNarrate` had until 2026-08-25.
    expect(sql).toMatch(/where exists \(select 1 from "?inserted"?\)/i);
    expect(bound).toContain('coach_ai');
    expect(bound).toContain('blocks_drafted');
    expect(bound).toContain(JSON.stringify(params.event.payload));
  });

  it('reports inserted when the row landed and exists when the index refused it', async () => {
    executeRows = [{ inserted: '1' }];
    expect(await insertBlockSet(params)).toBe('inserted');

    executeRows = [{ inserted: '0' }];
    expect(await insertBlockSet(params)).toBe('exists');
  });

  it('writes no event at all when none is given', async () => {
    executeRows = [{ inserted: '1' }];

    await insertBlockSet({ ...params, event: undefined });

    expect(executed[0].sql).not.toMatch(/"events"/);
    expect(executed[0].sql.replace(/\s+/g, ' ').trim()).toMatchSnapshot();
  });

  it('treats no result row at all as the index having refused it', async () => {
    executeRows = [];
    expect(await insertBlockSet(params)).toBe('exists');
  });

  it('renders the same statement every time — golden', async () => {
    // Every identifier in the statement is a literal, and a wrong one is a
    // runtime error against the real database that no mock can see. Pinned so
    // a changed column name shows in the diff.
    executeRows = [{ inserted: '1' }];
    await insertBlockSet(params);
    expect(executed[0].sql.replace(/\s+/g, ' ').trim()).toMatchSnapshot();
  });
});

describe('casUpdateBlockSet — compare-and-swap on version, event in the same statement', () => {
  const edited: TrainingBlockSpec[] = [
    { ...BLOCKS[0], name: 'Long Rides', authoredBy: 'head_coach' },
    BLOCKS[1],
  ];
  const params = {
    athleteId: ATHLETE,
    setId: SET_ID,
    expectedVersion: 3,
    blocks: edited,
    event: {
      actorType: 'head_coach' as const,
      actorId: '44444444-4444-4444-8444-444444444444',
      type: 'block_edited',
      payload: { raceId: RACE, position: 1 },
    },
  };

  it('updates only where id, athlete and the expected version all match, bumping version', async () => {
    executeRows = [{ version: 4 }];

    await casUpdateBlockSet(params);

    const { sql, params: bound } = executed[0];
    expect(sql).toMatch(/update "training_block_set"/i);
    expect(sql).toMatch(/"version" = "training_block_set"\."version" \+ 1/i);
    expect(sql).toMatch(/"athlete_id" = \$\d+/);
    expect(sql).toMatch(/"version" = \$\d+/);
    expect(bound).toContain(SET_ID);
    expect(bound).toContain(ATHLETE);
    expect(bound).toContain(3);
    expect(bound).toContain(JSON.stringify(edited));
  });

  it('inserts the event only where the update matched a row', async () => {
    executeRows = [{ version: 4 }];

    await casUpdateBlockSet(params);

    const { sql, params: bound } = executed[0];
    expect(sql).toMatch(/insert into "events"/i);
    expect(sql).toMatch(/where exists \(select 1 from "?updated"?\)/i);
    expect(bound).toContain('head_coach');
    expect(bound).toContain(params.event.actorId);
    expect(bound).toContain('block_edited');
  });

  it('renders the same statement every time — golden', async () => {
    executeRows = [{ version: 4 }];
    await casUpdateBlockSet(params);
    expect(executed[0].sql.replace(/\s+/g, ' ').trim()).toMatchSnapshot();
  });

  it('moves start_date only when asked — a redraft passes it, an edit does not', async () => {
    executeRows = [{ version: 4 }];
    await casUpdateBlockSet({ ...params, startDate: '2026-10-01' });
    expect(executed[0].sql).toMatch(/"start_date" = \$\d+::date/);
    expect(executed[0].params).toContain('2026-10-01');

    await casUpdateBlockSet(params);
    expect(executed[1].sql).not.toMatch(/start_date/);
  });

  it('returns the new version when it won, and conflict when the version had moved', async () => {
    executeRows = [{ version: 4 }];
    expect(await casUpdateBlockSet(params)).toEqual({ ok: true, version: 4 });

    executeRows = [];
    expect(await casUpdateBlockSet(params)).toEqual({ ok: false, reason: 'conflict' });
    // One statement each time: the loser gets its answer from the same round
    // trip, not from a second read.
    expect(executed).toHaveLength(2);
  });
});

describe('insertBlockEvent — one attributed row, scoped to the athlete', () => {
  it('writes the actor, type and payload against the athlete', async () => {
    await insertBlockEvent(ATHLETE, {
      actorType: 'coach_ai',
      actorId: null,
      type: 'race_flagged_unrealistic',
      payload: { raceId: RACE, reason: 'too short' },
    });

    expect(insertValues).toEqual([
      {
        athleteId: ATHLETE,
        actorType: 'coach_ai',
        actorId: null,
        type: 'race_flagged_unrealistic',
        payload: { raceId: RACE, reason: 'too short' },
      },
    ]);
  });
});

describe('getLatestUnrealisticFlag — the Coach’s standing verdict, scoped to the athlete', () => {
  it('filters on the athlete and the event type, and reads the reason out of the payload', async () => {
    nextRows = [{ payload: { raceId: RACE, reason: 'eleven months is short' } }];

    expect(await getLatestUnrealisticFlag(ATHLETE)).toBe('eleven months is short');

    const bound = boundValues(whereArgs[0]);
    expect(bound).toContain(ATHLETE);
    expect(bound).toContain('race_flagged_unrealistic');
  });

  it('returns null with no flag, or a flag whose payload carries no reason', async () => {
    expect(await getLatestUnrealisticFlag(ATHLETE)).toBeNull();
    nextRows = [{ payload: { raceId: RACE } }];
    expect(await getLatestUnrealisticFlag(ATHLETE)).toBeNull();
    nextRows = [{ payload: { reason: '   ' } }];
    expect(await getLatestUnrealisticFlag(ATHLETE)).toBeNull();
    nextRows = [{ payload: { reason: 42 } }];
    expect(await getLatestUnrealisticFlag(ATHLETE)).toBeNull();
  });

  it('trims the reason and selects only the payload column', async () => {
    nextRows = [{ payload: { reason: '  too short  ' } }];
    expect(await getLatestUnrealisticFlag(ATHLETE)).toBe('too short');
    expect(Object.keys(selectArgs[0] as object)).toEqual(['payload']);
  });
});
