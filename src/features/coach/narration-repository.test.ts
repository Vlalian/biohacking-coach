import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/db', () => ({
  getDb: () => Object.assign(chain(), { batch }),
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
  updateSets = [];
  insertValues = [];
  batch.mockClear();
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
  it('stamps the events and appends the message in ONE batch', async () => {
    // Atomicity is the point, not the order: a stamp without a message loses
    // the narration silently, a message without a stamp repeats it on the next
    // app-open. Both writes in one batch make each impossible.
    await claimAndNarrate({
      athleteId: 'a1',
      eventIds: ['ev_1', 'ev_2'],
      conversationId: 'conv_1',
      content: 'Lars added a session Thursday.',
    });

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batchCalls[0]).toHaveLength(2);
    expect(updateSets[0]).toMatchObject({ narratedAt: expect.any(Date) });
  });

  it('stores the narration as the Coach speaking, not the Head Coach', async () => {
    // The attribution lives in the words ("Lars added…"), per CONTEXT.md: the
    // Coach narrates the Head Coach's action. Stored as `coach_ai` so it also
    // replays as an assistant turn in later chat history rather than as
    // something the athlete or a third party said.
    await claimAndNarrate({
      athleteId: 'a1',
      eventIds: ['ev_1'],
      conversationId: 'conv_1',
      content: 'Lars added a session Thursday.',
    });

    expect(insertValues[0]).toMatchObject({
      conversationId: 'conv_1',
      role: 'coach_ai',
      content: 'Lars added a session Thursday.',
    });
  });

  it('re-asserts narrated_at IS NULL and the athlete id, so a concurrent render claims nothing', async () => {
    await claimAndNarrate({
      athleteId: 'a1',
      eventIds: ['ev_1'],
      conversationId: 'conv_1',
      content: 'x',
    });

    expect(boundValues(whereArgs[0])).toContain('a1');
    // The claim is what makes a race safe: the loser of two concurrent renders
    // matches no rows, so it narrates nothing rather than repeating the message.
    expect(columnNames(whereArgs[0])).toContain('narrated_at');
  });

  it('writes nothing at all when there is nothing to claim', async () => {
    await claimAndNarrate({
      athleteId: 'a1',
      eventIds: [],
      conversationId: 'conv_1',
      content: 'x',
    });

    expect(batch).not.toHaveBeenCalled();
  });
});
