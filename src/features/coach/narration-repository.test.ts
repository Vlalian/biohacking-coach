import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// Same mocked-chain shape as the other repository tests: every builder method
// returns the chain, awaiting it resolves the queued rows. Two things are
// captured beyond that, because this repository's whole job is *which rows* and
// *both writes or neither*: the arguments handed to `.where()`, so the athlete
// scoping (ADR 0006) can be asserted without a database, and the statements
// handed to `.batch()`.
let nextRows: unknown[] = [];
let whereArgs: unknown[] = [];
let batchCalls: unknown[][] = [];
let updateSets: unknown[] = [];
let insertValues: unknown[] = [];
let executed: { sql: string; params: unknown[] }[] = [];

const CHAIN_METHODS = [
  'select',
  'from',
  'orderBy',
  'limit',
  'update',
  'insert',
  'returning',
] as const;

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const m of CHAIN_METHODS) c[m] = () => c;
  c.where = (arg: unknown) => {
    whereArgs.push(arg);
    return c;
  };
  c.set = (v: unknown) => {
    updateSets.push(v);
    return c;
  };
  c.values = (v: unknown) => {
    insertValues.push(v);
    return c;
  };
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(nextRows).then(resolve);
  return c;
}

const batch = vi.fn(async (statements: unknown[]) => {
  batchCalls.push(statements);
  return [];
});

// `claimAndNarrate` is one raw statement, so the tests render it to real SQL
// with the same dialect the driver uses and assert against that. Mocking the
// driver cannot prove behaviour under two live connections — see the note on
// `claimAndNarrate` — but it can prove the gate is present and parameterised,
// which is what silently went missing before.
const execute = vi.fn(async (statement: unknown) => {
  executed.push(new PgDialect().sqlToQuery(statement as SQL));
  return [];
});

vi.mock('@/db', () => ({
  getDb: () => Object.assign(chain(), { batch, execute }),
}));

const { getPendingNarrationEvents, claimAndNarrate } = await import(
  './narration-repository'
);

/**
 * Every primitive bound into a drizzle condition, flattened.
 *
 * A `.where()` argument is an opaque SQL tree, so asserting "this query is
 * scoped to this athlete" means looking for the value inside it. Walking for
 * primitives is stable across drizzle's internal shape in a way that comparing
 * whole SQL objects is not, and it evidences exactly the claim ADR 0006 makes:
 * the athlete id is in the WHERE, not applied afterwards in JS.
 */
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

/**
 * Every column named anywhere in a condition tree.
 *
 * `isNull(...)` binds no value, so {@link boundValues} cannot see it — but the
 * column is there. This is how "the query really does filter on narrated_at"
 * gets asserted rather than asserted-in-a-test-name.
 */
function columnNames(node: unknown, seen = new Set<unknown>()): string[] {
  if (node === null || typeof node !== 'object') return [];
  if (seen.has(node)) return [];
  seen.add(node);
  const rec = node as Record<string, unknown>;
  const out: string[] = [];
  if (typeof rec.name === 'string' && 'table' in rec) out.push(rec.name);
  for (const value of Object.values(rec)) {
    if (value && typeof value === 'object') out.push(...columnNames(value, seen));
  }
  return out;
}

const eventRow = (over: Record<string, unknown> = {}) => ({
  id: 'ev_1',
  athleteId: 'a1',
  actorType: 'head_coach',
  actorId: 'coach_1',
  type: 'session_prescribed',
  payload: { sessionId: 's1', date: '2026-08-20', type: 'Endurance' },
  createdAt: new Date('2026-08-19T08:00:00Z'),
  narratedAt: null,
  ...over,
});

beforeEach(() => {
  nextRows = [];
  whereArgs = [];
  batchCalls = [];
  executed = [];
  updateSets = [];
  insertValues = [];
  batch.mockClear();
  execute.mockClear();
});

describe('getPendingNarrationEvents', () => {
  it('returns the athlete\'s pending events in the shape the composer wants', async () => {
    nextRows = [eventRow(), eventRow({ id: 'ev_2', type: 'session_deleted' })];

    const pending = await getPendingNarrationEvents('a1');

    expect(pending.map((e) => e.id)).toEqual(['ev_1', 'ev_2']);
    expect(pending[0]).toMatchObject({
      id: 'ev_1',
      actorId: 'coach_1',
      type: 'session_prescribed',
    });
  });

  it('scopes the query to the athlete id — another athlete is unreachable (ADR 0006)', async () => {
    nextRows = [];

    await getPendingNarrationEvents('a1');

    const bound = boundValues(whereArgs[0]);
    expect(bound).toContain('a1');
    // Not merely "an athlete id is in there" — the filter is the whole point:
    // only un-narrated Head Coach actions are ever pending.
    expect(bound).toContain('head_coach');
    // `isNull` binds no value, so the column is the only evidence of it.
    expect(columnNames(whereArgs[0])).toContain('narrated_at');
  });

  it('returns an empty list when nothing is pending', async () => {
    nextRows = [];
    expect(await getPendingNarrationEvents('a1')).toEqual([]);
  });
});

describe('claimAndNarrate', () => {
  it('claims the events and appends the message in ONE statement', async () => {
    // Atomicity is the point, not the order: a stamp without a message loses
    // the narration silently, a message without a stamp repeats it on the next
    // app-open. One statement makes each impossible.
    await claimAndNarrate({
      athleteId: 'a1',
      eventIds: ['ev_1', 'ev_2'],
      conversationId: 'conv_1',
      content: 'Your Head Coach added a session Thursday.',
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(batch).not.toHaveBeenCalled();

    const { sql } = executed[0];
    expect(sql).toMatch(/UPDATE "events" SET "narrated_at" = now\(\)/);
    expect(sql).toMatch(/INSERT INTO "messages"/);
  });

  it('gates the INSERT on having claimed every event, so a losing render writes nothing', async () => {
    // The bug this replaces (CodeRabbit, PR #39): the INSERT used to sit beside
    // the UPDATE in a batch and did not depend on it, so a render whose UPDATE
    // matched zero rows still appended the message and the athlete read the
    // same narration twice. The gate is the fix, so the gate is what is pinned.
    await claimAndNarrate({
      athleteId: 'a1',
      eventIds: ['ev_1', 'ev_2'],
      conversationId: 'conv_1',
      content: 'x',
    });

    const { sql, params } = executed[0];
    expect(sql).toMatch(/WHERE \(SELECT count\(\*\) FROM claimed\) = \$\d+/);
    // Both the claim and the message are conditional on the full set.
    expect(sql).toMatch(/AND \(SELECT count\(\*\) FROM free\) = \$\d+/);
    expect(params).toContain(2);
  });

  it('scopes every clause to the athlete, and never interpolates a value', async () => {
    // ADR 0006: the athlete id is in the WHERE, not applied afterwards in JS.
    // And raw SQL is where interpolation creeps in, so this asserts the ids
    // travel as parameters rather than as text in the statement.
    await claimAndNarrate({
      athleteId: 'a1',
      eventIds: ['ev_1'],
      conversationId: 'conv_1',
      content: "it's a note with a quote",
    });

    const { sql, params } = executed[0];
    expect(sql).toMatch(/"events"\."athlete_id" = \$\d+::uuid/);
    expect(sql).toMatch(/"events"\."narrated_at" IS NULL/);
    expect(params).toContain('a1');
    expect(params).toContain('ev_1');
    expect(params).toContain("it's a note with a quote");
    expect(sql).not.toContain('a1');
    expect(sql).not.toContain("it's a note");
  });

  it('stores the narration as the Coach speaking, not the Head Coach', async () => {
    // The attribution lives in the words, per CONTEXT.md: the Coach narrates
    // the Head Coach's action. Stored as `coach_ai` so it also replays as an
    // assistant turn in later chat history rather than as something the athlete
    // or a third party said.
    await claimAndNarrate({
      athleteId: 'a1',
      eventIds: ['ev_1'],
      conversationId: 'conv_1',
      content: 'Your Head Coach added a session Thursday.',
    });

    const { sql } = executed[0];
    expect(sql).toMatch(/INSERT INTO "messages" \(\s*"conversation_id",\s*"role",\s*"content",\s*"seq"\s*\)/);
    expect(sql).toContain("'coach_ai'");
  });

  it('writes nothing at all when there is nothing to claim', async () => {
    await claimAndNarrate({
      athleteId: 'a1',
      eventIds: [],
      conversationId: 'conv_1',
      content: 'x',
    });

    expect(batch).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
