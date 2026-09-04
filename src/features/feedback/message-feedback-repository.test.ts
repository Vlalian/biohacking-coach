import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The thumbs, at the persistence seam.
 *
 * Two guarantees carry the weight here and both are structural rather than
 * conventional: every query is scoped to the athlete resolved from the server
 * session (ADR 0006), and **there is no by-coach query at all**, which is how
 * "never shown to the Head Coach" is enforced. A filter someone can forget would
 * not be the same promise.
 */
const insertValues = vi.fn(() => ({ onConflictDoUpdate }));
const onConflictDoUpdate = vi.fn(() => Promise.resolve());
const deleteWhere = vi.fn(() => Promise.resolve());
const selectWhere = vi.fn((_condition: unknown) => Promise.resolve([] as unknown[]));
const select = vi.fn((_projection?: unknown) => ({ from: () => ({ where: selectWhere }) }));

vi.mock('@/db', () => ({
  getDb: () => ({
    insert: () => ({ values: insertValues }),
    delete: () => ({ where: deleteWhere }),
    select,
  }),
}));

/**
 * The literal values bound into a drizzle condition, including any subquery.
 *
 * Walks the whole object graph rather than only `queryChunks`, because the
 * athlete scoping on these queries sits inside an `inArray` subquery. Cyclic by
 * nature - drizzle's column objects point back at their table - hence the seen
 * set.
 */
function boundValues(condition: unknown): unknown[] {
  type Node = { value?: unknown };
  const out: unknown[] = [];
  const seen = new WeakSet<object>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const n = node as Node;
    // drizzle's StringChunk also has `.value`, as an array of SQL fragments;
    // only a bound Param carries a scalar, and those are the interesting ones.
    if ('value' in n && !Array.isArray(n.value) && typeof n.value !== 'object') {
      out.push(n.value);
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(condition);
  return out;
}

/** The column names a `select({...})` projection asks for. */
function projectionKeys(call: number): string[] {
  const args = call < 0 ? select.mock.calls.at(call) : select.mock.calls[call];
  return Object.keys((args?.[0] ?? {}) as Record<string, unknown>).sort();
}

const repo = await import('./message-feedback-repository');

const OWNER = 'athlete_1';

beforeEach(() => {
  insertValues.mockClear();
  onConflictDoUpdate.mockClear();
  deleteWhere.mockClear();
  select.mockClear();
  selectWhere.mockReset().mockResolvedValue([]);
});

describe('rateMessage', () => {
  it('stores a rating against the message id it was given', async () => {
    await repo.rateMessage({
      athleteId: OWNER,
      messageId: 'm1',
      rating: 'up',
      comment: null,
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: OWNER, messageId: 'm1', rating: 'up' }),
    );
  });

  it('replaces the existing flag rather than adding a second', async () => {
    // One flag per message, changeable. The unique index on `message_id` is what
    // makes that true; the upsert is how a change lands on it.
    await repo.rateMessage({
      athleteId: OWNER,
      messageId: 'm1',
      rating: 'down',
      comment: null,
    });

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const [conflict] = onConflictDoUpdate.mock.calls[0] as unknown as [
      { set: Record<string, unknown> },
    ];
    expect(conflict.set).toMatchObject({ rating: 'down' });
    // created_at is not touched on a change: the tester flagged it once and then
    // changed their mind, which is one act, not two.
    expect(conflict.set).not.toHaveProperty('createdAt');
  });

  it('stores an optional one-line comment, and null when there is none', async () => {
    await repo.rateMessage({
      athleteId: OWNER,
      messageId: 'm1',
      rating: 'down',
      comment: 'told me to train through a niggle',
    });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ comment: 'told me to train through a niggle' }),
    );

    await repo.rateMessage({ athleteId: OWNER, messageId: 'm2', rating: 'up', comment: null });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ comment: null }));
  });
});

describe('clearMessageRating', () => {
  it('removes the flag entirely — the tester changed their mind about flagging', async () => {
    await repo.clearMessageRating({ athleteId: OWNER, messageId: 'm1' });

    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});

describe('getRatingsForConversation', () => {
  it('returns a flag per message id, for this athlete only', async () => {
    selectWhere.mockResolvedValue([
      { messageId: 'm1', rating: 'up', comment: null },
      { messageId: 'm3', rating: 'down', comment: 'off' },
    ]);

    expect(await repo.getRatingsForConversation(OWNER, 'c1')).toEqual({
      m1: { rating: 'up', comment: null },
      m3: { rating: 'down', comment: 'off' },
    });
  });

  it('is an empty map when nothing was flagged', async () => {
    expect(await repo.getRatingsForConversation(OWNER, 'c1')).toEqual({});
  });

  it('reads exactly the three columns a surface renders, scoped to this athlete', async () => {
    await repo.getRatingsForConversation(OWNER, 'c1');

    // `select()` is called outer-first, but `where()` is called subquery-first:
    // the outer where's argument has to be built before the outer call is made.
    // The projection is the promise that nothing else leaves the table - no
    // created_at trail, and nothing that could be aggregated into a score.
    expect(projectionKeys(0)).toEqual(['comment', 'messageId', 'rating']);
    // The athlete is on the OUTER condition, so no other athlete's flag can
    // match even if a message id from their thread were somehow named.
    expect(boundValues(selectWhere.mock.calls.at(-1)?.[0])).toContain(OWNER);
    // The conversation is reached through its own messages, in the subquery,
    // which asks for ids and nothing else.
    expect(boundValues(selectWhere.mock.calls[0][0])).toContain('c1');
    expect(projectionKeys(1)).toEqual(['id']);
  });
});

describe('the Head Coach cannot reach the table', () => {
  it('exports no query keyed by a coach or spanning athletes', () => {
    // The same guarantee `feedback-repository.ts` states in words, asserted:
    // there is deliberately no by-coach query to call, so a Head Coach path
    // cannot read a tester's thumbs even by mistake.
    // An explicit allowlist, not a name check: `flaggableCoachMessage` is about
    // a Coach *message* and would fail a substring rule while being exactly
    // right. Adding to this list is meant to be a deliberate act - if a new
    // export appears here, someone has to say why a Head Coach still cannot
    // reach a tester's thumbs through it.
    expect(Object.keys(repo).sort()).toEqual([
      'clearMessageRating',
      'flaggableCoachMessage',
      'getRatingsForConversation',
      'rateMessage',
    ]);
  });
});

describe('flaggableCoachMessage — what may be flagged at all', () => {
  it('accepts a coach message in a conversation this athlete owns', async () => {
    selectWhere.mockResolvedValue([{ id: 'm1' }]);

    expect(await repo.flaggableCoachMessage(OWNER, 'm1')).toBe(true);
  });

  it('refuses a message that is not this athlete’s, or is not the Coach speaking', async () => {
    // One query answers both: it joins through the conversation to the owning
    // athlete and filters on role, so a message id lifted from someone else's
    // thread and an athlete's own turn are refused by the same statement.
    selectWhere.mockResolvedValue([]);

    expect(await repo.flaggableCoachMessage(OWNER, 'm1')).toBe(false);
  });

  it('asks only about the Coach’s own turns, in this athlete’s conversations', async () => {
    await repo.flaggableCoachMessage(OWNER, 'm1');

    // 'coach_ai' is the whole of "only a Coach message is flaggable": an
    // athlete rating their own turn says nothing anyone can act on.
    expect(boundValues(selectWhere.mock.calls.at(-1)?.[0])).toEqual(
      expect.arrayContaining(['m1', 'coach_ai']),
    );
    // ...and it is only asked within this athlete's own conversations.
    expect(boundValues(selectWhere.mock.calls[0][0])).toContain(OWNER);
    // Both statements ask for ids alone - existence is the whole question here.
    expect(projectionKeys(0)).toEqual(['id']);
    expect(projectionKeys(1)).toEqual(['id']);
  });
});
