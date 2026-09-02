import 'server-only';
import { embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

/**
 * The edge that turns text into vectors.
 *
 * One interface, one vendor implementation, and a hard boundary between them —
 * the same shape `coach-client.ts` uses for Anthropic, for the same two reasons.
 * The vendor lives in one file, so replacing it is a file and a migration rather
 * than a search-and-replace; and every test in this slice runs against a
 * deterministic fake, so no test ever costs money or needs a network.
 *
 * **This is a third processor.** The Coach talks to Anthropic; the database is
 * Neon; embedding adds OpenAI. At ingest time that is harmless — the corpus is
 * published papers, not athlete data, and nothing pseudonymous passes through
 * here. It stops being harmless at issue 03, when a *query built from an
 * athlete's training state* gets embedded: that is athlete-derived text reaching
 * a vendor the consent artifact does not name. Flagged here because this file is
 * where it will happen, and decided there, not here.
 */

/**
 * The model, and the number baked into the migration.
 *
 * `text-embedding-3-small` at 1536 dimensions, decided 2026-08-21 over a local
 * transformers.js model (no key and no third processor, but weaker retrieval and
 * a ~100MB download) and Voyage AI. `knowledge_chunks.embedding` is declared
 * `vector(1536)` to match, so these two constants are one fact stored twice —
 * change either and the other must move in the same commit.
 */
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

export interface Embedder {
  /** One vector per input, in input order. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * How many chunks go in one provider call.
 *
 * The AI SDK splits oversized requests itself, so this is not about the provider
 * limit — it is about failure granularity. A batch that fails loses a batch,
 * not the whole corpus, and the eight-source corpus is a handful of batches
 * either way.
 */
const BATCH_SIZE = 96;

export function openAiEmbedder(): Embedder {
  // Read at call time rather than at import, so importing this module never
  // demands a secret — the same rule `src/db/index.ts` follows for DATABASE_URL,
  // and what keeps `npm run build` and `npm test` runnable without one.
  const provider = () => {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. Add it to .env.local (gitignored) for local ' +
          'ingestion, or as a Vercel environment variable in deployment. It is a ' +
          'server secret and must never ship to the browser. Only the corpus ' +
          'ingest needs it today.',
      );
    }

    return createOpenAI({ apiKey }).textEmbeddingModel(EMBEDDING_MODEL);
  };

  return {
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const model = provider();
      const vectors: number[][] = [];

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const { embeddings } = await embedMany({
          model,
          values: texts.slice(i, i + BATCH_SIZE),
        });
        vectors.push(...embeddings);
      }

      return vectors;
    },
  };
}

/**
 * An embedder that fails the moment it is used.
 *
 * The dry run's guarantee is that it costs nothing, and a comment claiming so is
 * not a guarantee. Passing this into the planner turns "the dry run does not
 * embed" from an intention into a test that fails loudly if it ever stops being
 * true.
 */
export function refusingEmbedder(reason: string): Embedder {
  return {
    async embed(): Promise<number[][]> {
      throw new Error(`Refusing to embed: ${reason}`);
    },
  };
}
