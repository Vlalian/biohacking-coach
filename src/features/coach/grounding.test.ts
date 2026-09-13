import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGrounding, type LookupRecord } from './grounding';
import { LOOKUP_TOOL_NAME, NO_PASSAGES_RESULT } from '@/features/knowledge-oracle/lookup-tool';
import type { ChunkSearchResult, KnowledgeSearch } from '@/features/knowledge-oracle/retrieval';
import type { Embedder } from '@/features/knowledge-oracle/embedder';

/**
 * `knowledge-oracle/05` — one grounding per turn.
 *
 * F9, the retrieval cost per conversation, is pinned here as a number: **at
 * most one embedding and one vector query per turn in which the Coach called
 * the tool; zero on every other turn.** Nothing is per conversation and nothing
 * is cached, so a turn that never calls the tool costs nothing.
 */
const source = {
  id: 's1',
  slug: 'seiler-2010',
  title: 'Training intensity distribution',
  authors: 'Seiler S',
  year: 2010,
  doi: null,
  pmcid: null,
  licence: 'CC BY',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Seiler 2010, CC BY',
};

const hit = (text: string, ordinal: number, similarity = 0.7): ChunkSearchResult => ({
  text,
  ordinal,
  similarity,
  source,
});

const embed = vi.fn<Embedder['embed']>(async (texts) => texts.map(() => [0.1, 0.2, 0.3]));
const searchChunks = vi.fn<KnowledgeSearch['searchChunks']>(async () => [
  hit('Most sessions below the first threshold.', 3),
  hit('Intensity in small doses.', 7, 0.6),
]);
const recorded: LookupRecord[] = [];
const record = vi.fn(async (r: LookupRecord) => {
  recorded.push(r);
});

function grounding(over: Partial<Parameters<typeof createGrounding>[0]> = {}) {
  return createGrounding({
    embedder: { embed },
    search: { searchChunks },
    phase: 'Block 2 of 4',
    experienceLevel: 'intermediate',
    record,
    ...over,
  });
}

const call = (question: unknown = 'why is Thursday easy?') => ({
  name: LOOKUP_TOOL_NAME,
  input: { question },
});

beforeEach(() => {
  embed.mockClear();
  searchChunks.mockClear();
  record.mockClear();
  recorded.length = 0;
});

describe('createGrounding — the tool and its cost', () => {
  it('offers the lookup tool', () => {
    expect(grounding().tool.name).toBe(LOOKUP_TOOL_NAME);
  });

  it('a grounding whose tool was never called has embedded and searched nothing — F9, the zero case', () => {
    const g = grounding();
    expect(g.citations()).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
    expect(searchChunks).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('embeds and searches exactly once per call, with the phase and experience in the query', async () => {
    const g = grounding();
    const text = await g.resolve(call());

    expect(embed).toHaveBeenCalledTimes(1);
    expect(searchChunks).toHaveBeenCalledTimes(1);
    const query = embed.mock.calls[0][0][0];
    expect(query).toContain('why is Thursday easy?');
    expect(query).toContain('Block 2 of 4');
    expect(query).toContain('intermediate');
    expect(text).toContain('[1] Seiler S (2010) — Most sessions below the first threshold.');
  });

  it('remembers exactly what retrieval supplied as the citations, unchanged', async () => {
    const g = grounding();
    await g.resolve(call());
    expect(g.citations()).toEqual([
      expect.objectContaining({ sourceId: 's1', title: 'Training intensity distribution', ordinals: [3, 7] }),
    ]);
  });
});

describe('createGrounding — when there is nothing, or the input is wrong', () => {
  it('returns the no-grounding instruction and no citations when the corpus is silent', async () => {
    searchChunks.mockResolvedValueOnce([]);
    const g = grounding();
    expect(await g.resolve(call())).toBe(NO_PASSAGES_RESULT);
    expect(g.citations()).toEqual([]);
  });

  it('treats an input that is not a question as an empty lookup, without embedding', async () => {
    const g = grounding();
    expect(await g.resolve(call(42))).toBe(NO_PASSAGES_RESULT);
    expect(embed).not.toHaveBeenCalled();
  });

  it('returns the unavailable result when the question carries an identifier, embedding nothing', async () => {
    // `assertNoDirectIdentifier` throws on an email; an athlete who typed one
    // into a question still gets an answer — ungrounded, and said so.
    const g = grounding();
    const text = await g.resolve(call('is mads@example.com right that Z2 is 80 %?'));
    expect(text).toContain('Lookup unavailable');
    expect(embed).not.toHaveBeenCalled();
    expect(g.citations()).toEqual([]);
  });

  it('lets an embedder failure propagate — the adapter turns it into the unavailable result', async () => {
    embed.mockRejectedValueOnce(new Error('OPENAI_API_KEY is not set'));
    await expect(grounding().resolve(call())).rejects.toThrow('OPENAI_API_KEY');
  });
});

describe('createGrounding — the evidence Mads reads (option a, 2026-09-11)', () => {
  it('records one lookup_performed per lookup with the counts, and never the question text', async () => {
    await grounding().resolve(call('why is Thursday easy?'));
    expect(recorded).toEqual([{ questionLength: 21, passages: 2, citations: 1 }]);
    expect(JSON.stringify(recorded)).not.toContain('Thursday');
  });

  it('records the empty lookup too — a silent corpus is a fact worth counting', async () => {
    searchChunks.mockResolvedValueOnce([]);
    await grounding().resolve(call());
    expect(recorded).toEqual([{ questionLength: 21, passages: 0, citations: 0 }]);
  });

  it('a failing record never fails the lookup', async () => {
    record.mockRejectedValueOnce(new Error('db down'));
    const g = grounding();
    expect(await g.resolve(call())).toContain('[1]');
    expect(g.citations()).toHaveLength(1);
  });
});

describe('productionGrounding — without an OpenAI key', () => {
  it('refuses to embed with a one-line reason, which the adapter turns into the unavailable result', async () => {
    const { productionGrounding } = await import('./grounding');
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const g = productionGrounding({ athleteId: 'a1', surface: 'coach_chat', conversationId: null });
      await expect(g.resolve(call())).rejects.toThrow('OPENAI_API_KEY is not set');
      expect(g.citations()).toEqual([]);
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });
});
