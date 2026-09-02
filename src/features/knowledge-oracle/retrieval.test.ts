import { describe, it, expect } from 'vitest';
import type { KnowledgeSourceRow } from '@/db/schema';
import { refusingEmbedder, type Embedder } from './embedder';
import {
  retrievePassages,
  type ChunkSearchResult,
  type KnowledgeSearch,
} from './retrieval';

/**
 * Retrieval is a pure core over two ports — an {@link Embedder} and a
 * {@link KnowledgeSearch} — so every test here runs against fakes. None of them
 * costs an API call or needs Postgres.
 *
 * What that does *not* prove is that pgvector ranks sensibly against the real
 * corpus. No test can: relevance is a judgement, and the corpus is 1,583 chunks
 * of real training science. That is what `npm run oracle:ask` is for, and why
 * `MIN_SIMILARITY` is left at a documented default rather than tuned here.
 */

function source(over: Partial<KnowledgeSourceRow> = {}): KnowledgeSourceRow {
  return {
    id: 'src-1',
    slug: 'seiler-polarized',
    title: 'Polarized training intensity distribution',
    authors: 'Seiler S, Tønnessen E',
    year: 2009,
    doi: '10.1234/example',
    pmcid: 'PMC123456',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Seiler & Tønnessen 2009, CC BY 4.0',
    textDigest: 'digest',
    ingestedAt: new Date('2026-08-26'),
    ...over,
  };
}

function hit(over: Partial<ChunkSearchResult> = {}): ChunkSearchResult {
  return {
    text: 'Most endurance training should sit below the first ventilatory threshold.',
    ordinal: 0,
    similarity: 0.8,
    source: source(),
    ...over,
  };
}

/** An embedder that returns a fixed vector and records what it was asked. */
function fakeEmbedder(): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async embed(texts: string[]) {
      calls.push(texts);
      return texts.map(() => [0.1, 0.2, 0.3]);
    },
  };
}

function fakeSearch(hits: ChunkSearchResult[]): KnowledgeSearch & { limits: number[] } {
  const limits: number[] = [];
  return {
    limits,
    async searchChunks(_embedding: number[], limit: number) {
      limits.push(limit);
      return hits;
    },
  };
}

describe('retrievePassages', () => {
  it('embeds the built query and returns passages ranked by similarity, highest first', async () => {
    const embedder = fakeEmbedder();
    const result = await retrievePassages({
      embedder,
      search: fakeSearch([
        hit({ ordinal: 1, similarity: 0.55 }),
        hit({ ordinal: 2, similarity: 0.91 }),
        hit({ ordinal: 3, similarity: 0.72 }),
      ]),
      query: { question: 'How hard should easy days be?', phase: 'base' },
    });

    expect(result.passages.map((p) => p.similarity)).toEqual([0.91, 0.72, 0.55]);
    // What was embedded is the built query, not the raw question — the phase has
    // to reach the vector or the context is decorative.
    expect(embedder.calls).toHaveLength(1);
    expect(embedder.calls[0][0]).toContain('base');
    expect(embedder.calls[0][0]).toContain('How hard should easy days be?');
  });

  it('treats retrieval finding nothing as a first-class result, not an error', async () => {
    // Ticket 06 depends on the Coach behaving well when the corpus is silent, so
    // this must be an empty answer rather than a throw.
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([]),
      query: { question: 'What does the corpus say about nothing at all?' },
    });

    expect(result).toEqual({ passages: [], citations: [] });
  });

  it('never calls the embedder for a blank question', async () => {
    // `refusingEmbedder` throws the moment it is used, so this proves the path
    // spends nothing rather than merely asserting it.
    for (const question of ['', '   ', '\n\t ']) {
      const result = await retrievePassages({
        embedder: refusingEmbedder('a blank question must not be embedded'),
        search: fakeSearch([hit()]),
        query: { question },
      });

      expect(result).toEqual({ passages: [], citations: [] });
    }
  });

  it('drops passages below the similarity floor', async () => {
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([
        hit({ ordinal: 1, similarity: 0.9 }),
        hit({ ordinal: 2, similarity: 0.2 }),
        hit({ ordinal: 3, similarity: 0.45 }),
      ]),
      query: { question: 'How much volume in base?' },
      minSimilarity: 0.4,
    });

    expect(result.passages.map((p) => p.ordinal)).toEqual([1, 3]);
  });

  it('caps the passages it returns at topK', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      hit({ ordinal: i, similarity: 0.9 - i * 0.01 }),
    );

    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch(many),
      query: { question: 'How much volume in base?' },
      topK: 4,
    });

    expect(result.passages).toHaveLength(4);
  });

  it('asks the search for no more than topK', async () => {
    const search = fakeSearch([]);
    await retrievePassages({
      embedder: fakeEmbedder(),
      search,
      query: { question: 'How much volume in base?' },
      topK: 3,
    });

    expect(search.limits).toEqual([3]);
  });
});
describe('the citations retrieval returns', () => {
  it('collapses two chunks of one source into one citation, ordinals ascending', async () => {
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([
        hit({ ordinal: 7, similarity: 0.9 }),
        hit({ ordinal: 2, similarity: 0.8 }),
      ]),
      query: { question: 'How hard should easy days be?' },
    });

    expect(result.passages).toHaveLength(2);
    expect(result.citations).toHaveLength(1);
    // Ascending by position in the article, not by rank — a reader scanning the
    // paper reads forwards.
    expect(result.citations[0].ordinals).toEqual([2, 7]);
  });

  it('carries the licence and the attribution stored on the source row', async () => {
    // CC BY requires the attribution be displayable beside the passage, and the
    // ingest stores it for exactly that reason.
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([hit()]),
      query: { question: 'How hard should easy days be?' },
    });

    expect(result.citations[0].licence).toBe('CC BY 4.0');
    expect(result.citations[0].attribution).toBe('Seiler & Tønnessen 2009, CC BY 4.0');
    expect(result.citations[0].licenceUrl).toContain('creativecommons.org');
  });

  it('links to the DOI when the source has one', async () => {
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([hit({ source: source({ doi: '10.1519/JSC.0000' }) })]),
      query: { question: 'q' },
    });

    expect(result.citations[0].url).toBe('https://doi.org/10.1519/JSC.0000');
  });

  it('falls back to the PMC article when there is no DOI', async () => {
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([hit({ source: source({ doi: '', pmcid: 'PMC999' }) })]),
      query: { question: 'q' },
    });

    expect(result.citations[0].url).toBe(
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC999/',
    );
  });

  it('has no url when the source has neither a DOI nor a PMC id', async () => {
    // A defined absence, not a dead link — the renderer shows the title unlinked.
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([hit({ source: source({ doi: '', pmcid: null }) })]),
      query: { question: 'q' },
    });

    expect(result.citations[0].url).toBeNull();
  });

  it('orders citations by their best-ranked passage', async () => {
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([
        hit({ similarity: 0.5, source: source({ id: 'b', slug: 'second' }) }),
        hit({ similarity: 0.95, source: source({ id: 'a', slug: 'first' }) }),
      ]),
      query: { question: 'q' },
    });

    expect(result.citations.map((c) => c.sourceId)).toEqual(['a', 'b']);
  });

  it('caps citations by source, and drops the passages it could not account for', async () => {
    // The honesty property of a reference list: everything shown is listed. A
    // passage whose source did not make the cap would be an uncited claim, which
    // is worse than not showing it.
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([
        hit({ similarity: 0.9, source: source({ id: 'a' }) }),
        hit({ similarity: 0.8, source: source({ id: 'b' }) }),
        hit({ similarity: 0.7, source: source({ id: 'c' }) }),
      ]),
      query: { question: 'q' },
      maxCitations: 2,
    });

    expect(result.citations.map((c) => c.sourceId)).toEqual(['a', 'b']);
    expect(result.passages).toHaveLength(2);
    const cited = new Set(result.citations.map((c) => c.sourceId));
    expect(result.passages.every((p) => cited.has(p.sourceId))).toBe(true);
  });
});
describe('retrievePassages edge cases the mutants found', () => {
  it('returns empty when the embedder yields no vector', async () => {
    // A provider can return fewer embeddings than inputs. Reaching the search
    // with `undefined` as the vector would ask Postgres to rank against nothing.
    const emptyEmbedder = { async embed() { return [] as number[][]; } };

    const result = await retrievePassages({
      embedder: emptyEmbedder,
      search: fakeSearch([hit()]),
      query: { question: 'How hard should easy days be?' },
    });

    expect(result).toEqual({ passages: [], citations: [] });
  });

  it('keeps a passage sitting exactly on the similarity floor', async () => {
    // The floor is inclusive. `>` instead of `>=` would silently discard the
    // boundary case, and MIN_SIMILARITY is a number someone will tune by hand
    // to sit exactly on an observed score.
    const result = await retrievePassages({
      embedder: fakeEmbedder(),
      search: fakeSearch([hit({ ordinal: 1, similarity: 0.4 })]),
      query: { question: 'q' },
      minSimilarity: 0.4,
    });

    expect(result.passages).toHaveLength(1);
  });
});

