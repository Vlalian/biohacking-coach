import { describe, it, expect, vi, beforeEach } from 'vitest';
// Type-only, so it is erased before `vi.mock` hoisting matters.
import type { CorpusSource } from './corpus-manifest';

/**
 * The thenable chain mock this repo already uses
 * (`src/features/coach/coach-repository.test.ts`): builder methods return the
 * statement, awaiting it resolves the queued rows. It exercises the JS this
 * repository owns — the order of operations, and what lands in each payload —
 * without re-asserting drizzle's SQL generation or needing a database.
 *
 * One deviation from that original: `db.insert(...)` and friends each return a
 * **separate** tagged statement rather than one shared chain, so a test can read
 * what a batch contains and in what order. See {@link statement}.
 */
let nextRows: unknown[] = [];
/** Every call made on a chain, in order, as `[method, firstArgument]`. */
let calls: [string, unknown][] = [];

/** Builder methods that continue a statement rather than starting one. */
const CHAIN_METHODS = [
  'from',
  'where',
  'limit',
  'values',
  'onConflictDoUpdate',
  'returning',
  'set',
  // Added for `knowledgeSearch` (issue 03): the vector search joins the source
  // row and orders by cosine distance.
  'innerJoin',
  'orderBy',
] as const;

/** Statement kinds — `db.x(...)` starts one of these. */
const STATEMENT_KINDS = ['select', 'insert', 'update', 'delete'] as const;

/**
 * One queued statement, tagged with the kind that started it.
 *
 * Each `db.insert(...)`/`db.delete(...)` returns its **own** object rather than
 * a single shared chain, which is what lets a test read the order of a batch.
 * That matters here specifically: the statements are *built* in a different
 * order from the one they are executed in — `writeChunks` is constructed before
 * the delete that must precede it — so asserting on the order calls were made
 * would assert the opposite of the guarantee. The batch array is the execution
 * order; nothing else is.
 */
function statement(kind: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = { kind };
  for (const method of CHAIN_METHODS) {
    s[method] = (arg: unknown) => {
      calls.push([method, arg]);
      return s;
    };
  }
  s.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(nextRows).then(resolve);
  return s;
}

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {};
  for (const kind of STATEMENT_KINDS) {
    db[kind] = (arg: unknown) => {
      calls.push([kind, arg]);
      return statement(kind);
    };
  }
  // `batch` is how this driver gets a transaction: neon-http has no interactive
  // `db.transaction`, and sends a batch as one.
  db.batch = (statements: unknown) => {
    calls.push(['batch', statements]);
    return Promise.resolve(nextRows);
  };
  return db;
}

vi.mock('@/db', () => ({ getDb: () => chain() }));

/** The kinds inside the batch, in the order they will run. */
function batchKinds(): string[] {
  const batched = (argumentsFor('batch')[0] ?? []) as { kind: string }[];
  return batched.map((s) => s.kind);
}

const { knowledgeRepository, knowledgeSearch, offlineRepository } = await import(
  './knowledge-repository'
);

const SOURCE: CorpusSource = {
  slug: 'taper-meta-analysis-2023',
  title: 'Effects of tapering on performance in endurance athletes',
  authors: 'Wang Z, Wang YT, Gao W, Zhong Y',
  year: 2023,
  doi: '10.1371/journal.pone.0282838',
  pmcid: 'PMC10171681',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/',
  attribution: 'Wang Z, et al. (2023). Licensed CC BY 4.0.',
  territory: 'taper',
  verdict: 'in',
  reason: 'a fixture',
};

const CHUNKS = [
  { ordinal: 0, text: 'A two-week taper produced the largest gain.', tokenEstimate: 11, embedding: [0.1, 0.2] },
  { ordinal: 1, text: 'Volume fell while intensity was maintained.', tokenEstimate: 11, embedding: [0.3, 0.4] },
];

function argumentsFor(method: string): unknown[] {
  return calls.filter(([name]) => name === method).map(([, arg]) => arg);
}

beforeEach(() => {
  nextRows = [{ id: 'source-uuid' }];
  calls = [];
});

describe('knowledgeRepository.storedDigest', () => {
  it('returns the stored digest for a slug', async () => {
    nextRows = [{ textDigest: 'abc123' }];
    expect(await knowledgeRepository().storedDigest('taper-meta-analysis-2023')).toBe(
      'abc123',
    );
  });

  it('returns null when the source has never been ingested', async () => {
    nextRows = [];
    expect(await knowledgeRepository().storedDigest('never-seen')).toBeNull();
  });
});

/**
 * `replaceSource` has two shapes, and both must be one statement.
 *
 * The id the chunks reference has to be known before the batch is built, so the
 * repository reads it first. `nextRows` is what that read returns: a row means
 * a re-ingest, none means a source seen for the first time.
 */
describe('knowledgeRepository.replaceSource — a source already ingested', () => {
  beforeEach(() => {
    nextRows = [{ id: 'source-uuid' }];
  });

  it('writes metadata, chunks and the digest in ONE batch', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    // The guarantee, and the reason the id is read rather than returned from an
    // upsert: an awaited upsert commits outside the batch, so a batch that then
    // failed would leave this run's licence and attribution on a row whose
    // chunks and digest were still the previous run's — one version's metadata
    // vouching for another version's text.
    expect(argumentsFor('batch')).toHaveLength(1);

    const batched = argumentsFor('batch')[0] as unknown[];
    expect(batched).toHaveLength(3);

    const order = calls.map(([name]) => name);
    expect(order.filter((n) => n === 'batch')).toHaveLength(1);
  });

  it('carries the licence and the digest in the same update', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    // The licence is refreshed on every ingest on purpose — the register goes
    // stale — but it may not land a moment before the text it describes.
    expect(argumentsFor('set')[0]).toMatchObject({
      licence: 'CC BY 4.0',
      licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/',
      attribution: 'Wang Z, et al. (2023). Licensed CC BY 4.0.',
      textDigest: 'digest-1',
    });
  });

  it('deletes the old chunks, then inserts, then marks current', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    // Replace, never append: an ingest that doubled the corpus on its second run
    // would be worse than one that failed. Read off the batch, because the
    // statements are built in the opposite order from the one they run in.
    expect(batchKinds()).toEqual(['delete', 'insert', 'update']);
  });

  it('writes every chunk against the source id, keeping ordinals and vectors paired', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    const rows = payloads().chunkRows;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ordinal)).toEqual([0, 1]);
    expect(rows.map((r) => r.sourceId)).toEqual(['source-uuid', 'source-uuid']);
    expect(rows.map((r) => r.embedding)).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it('still clears the old chunks, and still marks current, when the text produces none', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', []);

    // Delete and update, no insert — and still marked current, so a source that
    // legitimately chunks to nothing is not re-ingested on every later run.
    expect(batchKinds()).toEqual(['delete', 'update']);
    expect(argumentsFor('set')[0]).toMatchObject({ textDigest: 'digest-1' });
  });
});

/** The source row and the chunk rows, found by shape rather than call order. */
function payloads() {
  const all = argumentsFor('values');
  return {
    sourceRow: all.find((p) => !Array.isArray(p)) as Record<string, unknown>,
    chunkRows: (all.find((p) => Array.isArray(p)) ?? []) as Record<string, unknown>[],
  };
}

describe('knowledgeRepository.replaceSource — a source seen for the first time', () => {
  beforeEach(() => {
    nextRows = [];
  });

  it('creates the row and its chunks in ONE batch, with no delete', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    // Nothing to clear: the row did not exist a statement ago.
    expect(batchKinds()).toEqual(['insert', 'insert']);
  });

  it('mints the id itself, so the chunks can reference a row not yet committed', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    const { sourceRow, chunkRows } = payloads();

    // A database-assigned id would have to be read back, and reading it back
    // means committing the row outside the batch — the thing this shape exists
    // to avoid.
    expect(sourceRow.id).toEqual(expect.any(String));
    expect(sourceRow.slug).toBe('taper-meta-analysis-2023');
    expect(chunkRows.map((r) => r.sourceId)).toEqual([sourceRow.id, sourceRow.id]);
  });

  it('writes the real digest, since nothing can land without the chunks', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    // On this path there is no window to protect against: the row and its chunks
    // are the same statement, so the digest cannot outlive a failure that lost
    // them.
    expect(payloads().sourceRow.textDigest).toBe('digest-1');
  });
});

describe('knowledgeRepository.replaceSource — the corpus holds no athlete', () => {
  it('writes no athlete-referencing column', async () => {
    nextRows = [{ id: 'source-uuid' }];

    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    // Asserted over the payload *keys*, not its values. Corpus prose says
    // "athletes" constantly — the fixture's own title does — so grepping the
    // text would fail on a paper about endurance athletes while catching
    // nothing real. What must not exist is a column that points at one.
    const rows = [...argumentsFor('values'), ...argumentsFor('set')].flatMap(
      (payload) => (Array.isArray(payload) ? payload : [payload]),
    ) as Record<string, unknown>[];

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        expect(key, `${key} in a corpus payload`).not.toMatch(/athlete/i);
      }
    }
  });
});

describe('offlineRepository', () => {
  it('reports nothing stored, so a dry run works without DATABASE_URL', async () => {
    expect(await offlineRepository().storedDigest('anything')).toBeNull();
  });

  it('refuses to write', async () => {
    await expect(
      offlineRepository().replaceSource(SOURCE, 'digest-1', CHUNKS),
    ).rejects.toThrow(/cannot write/);
  });
});

describe('knowledgeSearch.searchChunks', () => {
  /**
   * These prove the JS this repository owns — the order of operations, the limit
   * it passes, and the distance-to-similarity conversion. They do **not** prove
   * that Postgres ranks correctly: `getDb()` speaks Neon over HTTP and there is
   * no test database. Reading real rankings is what `npm run oracle:ask` is for.
   */
  it('orders by cosine distance and applies the limit it was given', async () => {
    nextRows = [];
    await knowledgeSearch().searchChunks([0.1, 0.2], 4);

    // Ascending distance = nearest first. `orderBy` receiving the same SQL the
    // projection selected is what stops the ranked number and the returned
    // number drifting apart.
    expect(argumentsFor('orderBy')).toHaveLength(1);
    expect(argumentsFor('limit')).toEqual([4]);
    expect(argumentsFor('innerJoin')).toHaveLength(1);

    // The projection has to carry the distance and the whole source row: the
    // distance is what similarity is derived from, and the source row is what a
    // citation is built out of. An emptied select would return neither.
    const projection = argumentsFor('select')[0] as Record<string, unknown>;
    expect(Object.keys(projection).sort()).toEqual([
      'distance',
      'ordinal',
      'source',
      'text',
    ]);
  });

  it('converts distance to similarity, so bigger means closer', async () => {
    nextRows = [
      {
        text: 'A two-week taper produced the largest gain.',
        ordinal: 3,
        distance: 0.25,
        source: { id: 'source-uuid', slug: 'taper-meta-analysis-2023' },
      },
    ];

    const [result] = await knowledgeSearch().searchChunks([0.1, 0.2], 6);

    expect(result.similarity).toBeCloseTo(0.75);
    expect(result.ordinal).toBe(3);
    expect(result.source.slug).toBe('taper-meta-analysis-2023');
  });
});
