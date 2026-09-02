import { describe, it, expect, vi } from 'vitest';
import { ingestCorpus, digestOf, type KnowledgeRepository } from './ingest';
import { refusingEmbedder, type Embedder } from './embedder';
import { SourceRefused, type CorpusSource } from './corpus-manifest';

function source(slug: string, overrides: Partial<CorpusSource> = {}): CorpusSource {
  return {
    slug,
    title: `Title of ${slug}`,
    authors: 'Someone A, Someone B',
    year: 2023,
    doi: '10.0000/test',
    pmcid: 'PMC1234567',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://example.org/licence',
    attribution: `Someone A, Someone B (2023). Title of ${slug}. Licensed CC BY 4.0.`,
    territory: 'testing',
    verdict: 'in',
    reason: 'a fixture',
    ...overrides,
  };
}

/** Enough prose to produce several chunks at the small caps used below. */
const ARTICLE =
  'Tapering reduces training volume while intensity is maintained. ' +
  'A two-week taper produced the largest performance gain in the pooled analysis. ' +
  'Carbohydrate intake of sixty to ninety grams per hour is recommended for long efforts. ' +
  'Athletes who trained the gut tolerated higher feeding rates than those who did not. ' +
  'Polarized distribution places roughly eighty percent of sessions at low intensity.';

function fakeRepository(stored: Record<string, string> = {}) {
  const writes: {
    slug: string;
    digest: string;
    chunks: { ordinal: number; text: string; embedding: number[] }[];
    licence: string;
    licenceUrl: string;
    attribution: string;
  }[] = [];

  const repository: KnowledgeRepository = {
    async storedDigest(slug) {
      return stored[slug] ?? null;
    },
    async replaceSource(source, textDigest, chunks) {
      writes.push({
        slug: source.slug,
        digest: textDigest,
        chunks: chunks.map((c) => ({
          ordinal: c.ordinal,
          text: c.text,
          embedding: c.embedding,
        })),
        licence: source.licence,
        licenceUrl: source.licenceUrl,
        attribution: source.attribution,
      });
      stored[source.slug] = textDigest;
    },
  };

  return { repository, writes, stored };
}

/** Deterministic, offline, and counted. */
function countingEmbedder(): Embedder & { calls: number } {
  const embedder = {
    calls: 0,
    async embed(texts: string[]) {
      embedder.calls++;
      return texts.map((_, i) => [i, texts.length]);
    },
  };
  return embedder;
}

const CHUNKS = { maxChars: 120, overlapChars: 30 };

describe('ingestCorpus — dry run', () => {
  it('reports slug, chunk count and token estimate per source', async () => {
    const { repository } = fakeRepository();

    const report = await ingestCorpus({
      sources: [source('taper'), source('fuelling')],
      readText: async () => ARTICLE,
      repository,
      // If the dry run ever embeds, this throws and the test fails. The promise
      // that a dry run costs nothing is enforced here, not asserted in a comment.
      embedder: refusingEmbedder('this is a dry run'),
      chunkOptions: CHUNKS,
    });

    expect(report.live).toBe(false);
    expect(report.sources.map((s) => s.slug)).toEqual(['taper', 'fuelling']);

    for (const planned of report.sources) {
      expect(planned.status).toBe('ready');
      expect(planned.chunkCount).toBeGreaterThan(1);
      expect(planned.tokenEstimate).toBeGreaterThan(0);
    }

    expect(report.totalChunks).toBe(
      report.sources.reduce((sum, s) => sum + s.chunkCount, 0),
    );
  });

  it('writes nothing', async () => {
    const { repository, writes } = fakeRepository();

    await ingestCorpus({
      sources: [source('taper')],
      readText: async () => ARTICLE,
      repository,
      embedder: refusingEmbedder('this is a dry run'),
      chunkOptions: CHUNKS,
    });

    expect(writes).toHaveLength(0);
  });

  it('names a source with no cached text rather than ingesting an empty one', async () => {
    const { repository, writes } = fakeRepository();

    const report = await ingestCorpus({
      sources: [source('taper'), source('never-fetched')],
      readText: async (slug) => (slug === 'taper' ? ARTICLE : null),
      repository,
      embedder: refusingEmbedder('this is a dry run'),
      chunkOptions: CHUNKS,
    });

    expect(report.missing).toEqual(['never-fetched']);
    const missing = report.sources.find((s) => s.slug === 'never-fetched');
    expect(missing?.status).toBe('missing');
    expect(missing?.chunkCount).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it('treats whitespace-only cached text as missing', async () => {
    const { repository } = fakeRepository();

    const report = await ingestCorpus({
      sources: [source('empty-file')],
      readText: async () => '   \n  ',
      repository,
      embedder: refusingEmbedder('this is a dry run'),
      chunkOptions: CHUNKS,
    });

    expect(report.missing).toEqual(['empty-file']);
  });
});

describe('ingestCorpus — live run', () => {
  it('writes the licence, licence URL and attribution onto the source row', async () => {
    const { repository, writes } = fakeRepository();

    await ingestCorpus({
      sources: [source('taper')],
      readText: async () => ARTICLE,
      repository,
      embedder: countingEmbedder(),
      live: true,
      chunkOptions: CHUNKS,
    });

    expect(writes).toHaveLength(1);
    // A corpus row that loses its licence on the way into the database has
    // defeated the purpose of writing the row (corpus.md's closing instruction).
    expect(writes[0].licence).toBe('CC BY 4.0');
    expect(writes[0].licenceUrl).toBe('https://example.org/licence');
    expect(writes[0].attribution).toContain('Licensed CC BY 4.0');
  });

  it('pairs each chunk with its own vector, in order', async () => {
    const { repository, writes } = fakeRepository();

    await ingestCorpus({
      sources: [source('taper')],
      readText: async () => ARTICLE,
      repository,
      embedder: countingEmbedder(),
      live: true,
      chunkOptions: CHUNKS,
    });

    const chunks = writes[0].chunks;
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
    // The fake vector's first element is the input's index, so a reordering
    // between embedding and writing shows up here.
    expect(chunks.map((c) => c.embedding[0])).toEqual(chunks.map((_, i) => i));
  });

  it('refuses to write when the embedder returns the wrong number of vectors', async () => {
    const { repository, writes } = fakeRepository();
    const short: Embedder = { async embed(texts) { return texts.slice(1).map(() => [0]); } };

    await expect(
      ingestCorpus({
        sources: [source('taper')],
        readText: async () => ARTICLE,
        repository,
        embedder: short,
        live: true,
        chunkOptions: CHUNKS,
      }),
    ).rejects.toThrow(/Refusing to write/);

    expect(writes).toHaveLength(0);
  });
});

describe('ingestCorpus — re-running', () => {
  it('skips a source whose text has not changed, without embedding it', async () => {
    const { repository, writes } = fakeRepository({ taper: digestOf(ARTICLE) });
    const embedder = countingEmbedder();

    const report = await ingestCorpus({
      sources: [source('taper')],
      readText: async () => ARTICLE,
      repository,
      embedder,
      live: true,
      chunkOptions: CHUNKS,
    });

    expect(report.unchanged).toEqual(['taper']);
    expect(writes).toHaveLength(0);
    // The saving is the point: an unchanged corpus must not be re-embedded.
    expect(embedder.calls).toBe(0);
  });

  it('replaces the chunks of a source whose text has changed, rather than appending', async () => {
    const { repository, writes } = fakeRepository({ taper: digestOf('the old text') });

    await ingestCorpus({
      sources: [source('taper')],
      readText: async () => ARTICLE,
      repository,
      embedder: countingEmbedder(),
      live: true,
      chunkOptions: CHUNKS,
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].digest).toBe(digestOf(ARTICLE));
  });

  it('is idempotent across two consecutive live runs', async () => {
    const { repository, writes } = fakeRepository();
    const embedder = countingEmbedder();
    const run = () =>
      ingestCorpus({
        sources: [source('taper')],
        readText: async () => ARTICLE,
        repository,
        embedder,
        live: true,
        chunkOptions: CHUNKS,
      });

    await run();
    const second = await run();

    // One write, one embed, no matter how many times it runs.
    expect(writes).toHaveLength(1);
    expect(embedder.calls).toBe(1);
    expect(second.unchanged).toEqual(['taper']);
    expect(second.ingested).toEqual([]);
  });
});

describe('ingestCorpus — the register outranks the caller', () => {
  it('refuses a source marked out, by name, and writes nothing', async () => {
    const { repository, writes } = fakeRepository();
    const readText = vi.fn(async () => ARTICLE);

    await expect(
      ingestCorpus({
        sources: [source('ruled-out', { verdict: 'out', outReason: 'commercial' })],
        readText,
        repository,
        embedder: countingEmbedder(),
        live: true,
        chunkOptions: CHUNKS,
      }),
    ).rejects.toThrow(SourceRefused);

    expect(writes).toHaveLength(0);
    // Refused before its text was even read — the verdict is checked first.
    expect(readText).not.toHaveBeenCalled();
  });

  it('refuses an in source whose licence is inadmissible', async () => {
    const { repository } = fakeRepository();

    await expect(
      ingestCorpus({
        sources: [source('contradictory', { licence: 'CC BY-NC 4.0' })],
        readText: async () => ARTICLE,
        repository,
        embedder: countingEmbedder(),
        live: true,
        chunkOptions: CHUNKS,
      }),
    ).rejects.toThrow(/not\s+CC0 or CC BY/);
  });
});
