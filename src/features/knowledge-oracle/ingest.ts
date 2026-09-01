import { createHash } from 'node:crypto';
import { chunkText, type ChunkOptions } from './chunk';
import { admitSource, type CorpusSource } from './corpus-manifest';
import type { Embedder } from './embedder';

/**
 * The ingest itself: plan, then (only if asked) embed and write.
 *
 * Framework-free and port-shaped — text arrives through `readText`, the database
 * through `repository`, the vendor through `embedder`. None of the three is
 * imported here, which is what lets the whole of this file be tested with no
 * network, no filesystem, and no Postgres, and what lets the dry run be *proved*
 * free rather than described as free.
 *
 * The safety property worth naming: **`live: false` never calls the embedder and
 * never writes.** That is not a comment, it is the shape of the code below and
 * a test that passes an embedder which throws on use.
 */

/** Reads an article's cached full text. Null when it was never fetched. */
export type ReadText = (slug: string) => Promise<string | null>;

export interface ChunkToWrite {
  ordinal: number;
  text: string;
  tokenEstimate: number;
  embedding: number[];
}

export interface KnowledgeRepository {
  /** The digest of the text a source's stored chunks were built from. */
  storedDigest(slug: string): Promise<string | null>;
  /**
   * Write a source and its chunks, replacing whatever was there.
   *
   * Replace rather than append: issue 02's rule is that "an ingest that doubles
   * the corpus on second run is worse than one that fails".
   */
  replaceSource(
    source: CorpusSource,
    textDigest: string,
    chunks: ChunkToWrite[],
  ): Promise<void>;
}

export type SourceStatus =
  /** Text is cached and its digest differs from what is stored — will ingest. */
  | 'ready'
  /** Text is cached and unchanged since the last ingest — nothing to do. */
  | 'unchanged'
  /** No cached text. Reported and skipped; never ingested as an empty source. */
  | 'missing';

export interface PlannedSource {
  slug: string;
  title: string;
  status: SourceStatus;
  chunkCount: number;
  tokenEstimate: number;
  /** Null when there is no text to digest. */
  digest: string | null;
}

export interface IngestReport {
  live: boolean;
  sources: PlannedSource[];
  /** Chunks that were written, or that a live run would write. */
  totalChunks: number;
  totalTokenEstimate: number;
  /** Slugs with no cached text. Non-empty means the run was incomplete. */
  missing: string[];
  ingested: string[];
  unchanged: string[];
}

/**
 * SHA-256 of the source text.
 *
 * The whole of idempotence rests on this: same text, same digest, so the chunks
 * already in the database are still correct and no embedding call is paid for.
 * Over the extracted text rather than the raw XML, because a publisher
 * reformatting its markup is not a change to the science.
 */
export function digestOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface IngestOptions {
  sources: readonly CorpusSource[];
  readText: ReadText;
  repository: KnowledgeRepository;
  embedder: Embedder;
  /** False plans and reports; true embeds and writes. Default false. */
  live?: boolean;
  chunkOptions?: ChunkOptions;
}

/**
 * Plan an ingest, and carry it out when `live`.
 *
 * Every source passes `admitSource` first, so the register's verdict is enforced
 * here and not only at the call site — the caller could hand us any row, and
 * "the script refuses it rather than trusting the caller" is the acceptance
 * criterion.
 */
export async function ingestCorpus(options: IngestOptions): Promise<IngestReport> {
  const { sources, readText, repository, embedder, chunkOptions } = options;
  const live = options.live ?? false;

  const planned: PlannedSource[] = [];

  for (const candidate of sources) {
    // Throws SourceRefused, naming the source. Deliberately not caught: a run
    // that quietly skipped an inadmissible source would report success while
    // silently narrowing the corpus.
    const source = admitSource(candidate);

    const text = await readText(source.slug);

    if (!text || !text.trim()) {
      planned.push({
        slug: source.slug,
        title: source.title,
        status: 'missing',
        chunkCount: 0,
        tokenEstimate: 0,
        digest: null,
      });
      continue;
    }

    const digest = digestOf(text);
    const stored = await repository.storedDigest(source.slug);

    if (stored === digest) {
      planned.push({
        slug: source.slug,
        title: source.title,
        status: 'unchanged',
        chunkCount: 0,
        tokenEstimate: 0,
        digest,
      });
      continue;
    }

    const chunks = chunkText(text, chunkOptions);

    planned.push({
      slug: source.slug,
      title: source.title,
      status: 'ready',
      chunkCount: chunks.length,
      tokenEstimate: chunks.reduce((sum, c) => sum + c.tokenEstimate, 0),
      digest,
    });

    if (!live) continue;

    // Past this line is the only code in the file that spends money or writes.
    const embeddings = await embedder.embed(chunks.map((c) => c.text));

    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedder returned ${embeddings.length} vectors for ${chunks.length} ` +
          `chunks of "${source.slug}". Refusing to write: a length mismatch means ` +
          'passages and vectors can no longer be paired, and the wrong pairing is ' +
          'silent at read time.',
      );
    }

    await repository.replaceSource(
      source,
      digest,
      chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] })),
    );
  }

  const ready = planned.filter((s) => s.status === 'ready');

  return {
    live,
    sources: planned,
    totalChunks: ready.reduce((sum, s) => sum + s.chunkCount, 0),
    totalTokenEstimate: ready.reduce((sum, s) => sum + s.tokenEstimate, 0),
    missing: planned.filter((s) => s.status === 'missing').map((s) => s.slug),
    ingested: live ? ready.map((s) => s.slug) : [],
    unchanged: planned.filter((s) => s.status === 'unchanged').map((s) => s.slug),
  };
}

/** The report as lines for a terminal. Plain data in, strings out. */
export function formatReport(report: IngestReport): string[] {
  const lines: string[] = [
    report.live
      ? 'LIVE RUN — embedding and writing.'
      : 'DRY RUN — nothing embedded, nothing written. Pass --live to ingest.',
    '',
  ];

  for (const source of report.sources) {
    const detail =
      source.status === 'missing'
        ? 'no cached text — run with --fetch first'
        : source.status === 'unchanged'
          ? 'unchanged since last ingest — skipped'
          : `${source.chunkCount} chunks, ~${source.tokenEstimate} tokens`;

    lines.push(`  ${source.status.padEnd(9)} ${source.slug.padEnd(38)} ${detail}`);
  }

  lines.push('');
  lines.push(
    `  ${report.sources.length} sources: ${report.ingested.length || report.sources.filter((s) => s.status === 'ready').length} to ingest, ` +
      `${report.unchanged.length} unchanged, ${report.missing.length} missing`,
  );
  lines.push(
    `  ${report.totalChunks} chunks, ~${report.totalTokenEstimate} tokens to embed`,
  );

  if (report.missing.length) {
    // Stated loudly on purpose. Issue 02's rule: if a source cannot be fetched,
    // report it and stop short of claiming a full ingest.
    lines.push('');
    lines.push(
      `  INCOMPLETE — ${report.missing.length} source(s) had no cached text: ${report.missing.join(', ')}`,
    );
  }

  return lines;
}
