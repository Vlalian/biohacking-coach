import { describe, it, expect, vi, beforeEach } from 'vitest';
// Type-only, so it is erased before `vi.mock` hoisting matters.
import type { CorpusSource } from './corpus-manifest';

/**
 * The thenable chain mock this repo already uses
 * (`src/features/coach/coach-repository.test.ts`): every builder method returns
 * the chain, awaiting it resolves the queued rows. It exercises the JS this
 * repository owns — the order of operations, and what lands in each payload —
 * without re-asserting drizzle's SQL generation or needing a database.
 */
let nextRows: unknown[] = [];
/** Every call made on a chain, in order, as `[method, firstArgument]`. */
let calls: [string, unknown][] = [];

const CHAIN_METHODS = [
  'select',
  'from',
  'where',
  'limit',
  'insert',
  'values',
  'onConflictDoUpdate',
  'returning',
  'delete',
  'update',
  'set',
  // `batch` is how this driver gets a transaction: neon-http has no interactive
  // `db.transaction`, and sends a batch as one. Queued statements record their
  // own calls as they are built, so the array it receives needs no unwrapping.
  'batch',
] as const;

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const method of CHAIN_METHODS) {
    c[method] = (arg: unknown) => {
      calls.push([method, arg]);
      return c;
    };
  }
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(nextRows).then(resolve);
  return c;
}

vi.mock('@/db', () => ({ getDb: () => chain() }));

const { knowledgeRepository, offlineRepository } = await import(
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

describe('knowledgeRepository.replaceSource', () => {
  it('writes the licence, licence URL and attribution onto the source row', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    const values = argumentsFor('values')[0] as Record<string, unknown>;
    expect(values.licence).toBe('CC BY 4.0');
    expect(values.licenceUrl).toBe('https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/');
    expect(values.attribution).toBe('Wang Z, et al. (2023). Licensed CC BY 4.0.');
    // Not the real digest: the row may not claim its chunks are current before
    // they have been written. See the atomicity tests below.
    expect(values.textDigest).toBe('');
  });

  it('refreshes the licence on conflict, so a re-ingest lands the current reading', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    const conflict = argumentsFor('onConflictDoUpdate')[0] as {
      set: Record<string, unknown>;
    };
    expect(conflict.set.licence).toBe('CC BY 4.0');
  });

  it('leaves the previous digest standing while the metadata is refreshed', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    const conflict = argumentsFor('onConflictDoUpdate')[0] as {
      set: Record<string, unknown>;
    };

    // The upsert must not touch the digest. If it did, a crash before the chunks
    // landed would leave a row claiming to be current with nothing behind it —
    // and `storedDigest` would then report `unchanged` on every later run,
    // skipping that source forever.
    expect(conflict.set).not.toHaveProperty('textDigest');
  });

  it('writes the digest and the chunks in one batch, digest last', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    // neon-http sends a batch as a single transaction, so this is the guarantee:
    // the old chunks go, the new chunks land, and the digest that vouches for
    // them is set — all of it, or none of it.
    const batched = argumentsFor('batch')[0] as unknown[];
    expect(batched).toHaveLength(3);

    expect(argumentsFor('set')[0]).toMatchObject({ textDigest: 'digest-1' });

    const order = calls.map(([name]) => name);
    expect(order.lastIndexOf('insert')).toBeLessThan(order.indexOf('batch'));
  });

  it('deletes the old chunks before inserting the new ones', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    const order = calls.map(([name]) => name);
    const deleteAt = order.indexOf('delete');
    const lastInsertAt = order.lastIndexOf('insert');

    // Replace, never append: an ingest that doubled the corpus on its second run
    // would be worse than one that failed.
    expect(deleteAt).toBeGreaterThan(-1);
    expect(lastInsertAt).toBeGreaterThan(deleteAt);
  });

  it('writes every chunk against the source id, keeping ordinals and vectors paired', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    const rows = argumentsFor('values')[1] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ordinal)).toEqual([0, 1]);
    expect(rows.map((r) => r.sourceId)).toEqual(['source-uuid', 'source-uuid']);
    expect(rows.map((r) => r.embedding)).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it('still clears the old chunks when the new text produces none', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', []);

    expect(argumentsFor('delete')).toHaveLength(1);
    // One insert (the source row), not two — there are no chunks to write.
    expect(argumentsFor('insert')).toHaveLength(1);

    // Still batched, still marked current: a source that legitimately chunks to
    // nothing must not be re-ingested on every subsequent run.
    expect(argumentsFor('batch')[0] as unknown[]).toHaveLength(2);
    expect(argumentsFor('set')[0]).toMatchObject({ textDigest: 'digest-1' });
  });

  it('writes no athlete-referencing column', async () => {
    await knowledgeRepository().replaceSource(SOURCE, 'digest-1', CHUNKS);

    // Asserted over the payload *keys*, not its values. Corpus prose says
    // "athletes" constantly — the fixture's own title does — so grepping the
    // text would fail on a paper about endurance athletes while catching
    // nothing real. What must not exist is a column that points at one.
    const rows = argumentsFor('values').flatMap((payload) =>
      Array.isArray(payload) ? payload : [payload],
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
