import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `embedMany` is the boundary. Mocking it — rather than the HTTP underneath —
 * keeps the test about the JS this adapter actually owns: batching, ordering,
 * and the missing-key error. It never issues a request and never costs money.
 */
const embedMany = vi.hoisted(() => vi.fn());
vi.mock('ai', () => ({ embedMany }));

const { openAiEmbedder, refusingEmbedder, EMBEDDING_DIMENSIONS } = await import(
  './embedder'
);

/** A vector whose first element encodes its input, so order is checkable. */
function fakeVector(text: string): number[] {
  return [Number(text.replace(/\D/g, '')) || 0];
}

beforeEach(() => {
  embedMany.mockReset();
  embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
    embeddings: values.map(fakeVector),
  }));
  process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key';
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe('openAiEmbedder', () => {
  it('returns one vector per input, in input order', async () => {
    const texts = ['chunk 1', 'chunk 2', 'chunk 3'];

    const vectors = await openAiEmbedder().embed(texts);

    expect(vectors).toHaveLength(3);
    // Order is the whole contract: chunk N's vector is written to chunk N's row,
    // and a silent reordering would attach every passage to the wrong citation.
    expect(vectors.map((v) => v[0])).toEqual([1, 2, 3]);
  });

  it('issues one provider call per batch, not one per chunk', async () => {
    // 200 chunks at a batch size of 96 is three calls. The point is that it is
    // not 200 — a call per chunk turns a few cents into a rate-limit problem.
    const texts = Array.from({ length: 200 }, (_, i) => `chunk ${i + 1}`);

    const vectors = await openAiEmbedder().embed(texts);

    expect(vectors).toHaveLength(200);
    expect(embedMany).toHaveBeenCalledTimes(3);
    expect(vectors.map((v) => v[0])).toEqual(texts.map((_, i) => i + 1));
  });

  it('does not call the provider for an empty list', async () => {
    expect(await openAiEmbedder().embed([])).toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
  });

  it('fails loudly when the key is missing, naming where it goes', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(openAiEmbedder().embed(['chunk'])).rejects.toThrow(
      /OPENAI_API_KEY is not set/,
    );
    expect(embedMany).not.toHaveBeenCalled();
  });

  it('does not read the key at import time', () => {
    // Importing a module must not demand a secret, or `npm run build` and
    // `npm test` stop working without one. Constructing the embedder is not
    // using it; only `embed` may throw.
    delete process.env.OPENAI_API_KEY;
    expect(() => openAiEmbedder()).not.toThrow();
  });

  it('pins the dimensionality the migration was written against', () => {
    // `knowledge_chunks.embedding` is `vector(1536)`. These are one fact stored
    // twice; if this ever disagrees with the migration, inserts fail at runtime.
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });
});

describe('refusingEmbedder', () => {
  it('throws rather than embedding, carrying its reason', async () => {
    await expect(refusingEmbedder('this is a dry run').embed(['x'])).rejects.toThrow(
      /this is a dry run/,
    );
  });
});
