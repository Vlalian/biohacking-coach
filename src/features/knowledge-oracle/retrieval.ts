import type { Embedder } from './embedder';
import { buildOracleQuery, type OracleQuery } from './query';

/**
 * The Knowledge Oracle's actual call: a pseudonymous query goes in, ranked
 * passages and the citations behind them come out.
 *
 * Pure core over two ports. It does not render, does not build prompts, and does
 * not call the Coach — tickets 04 and 05 decide what to do with the result. That
 * is what lets the whole of this file be tested with no network and no Postgres,
 * and it is the acceptance criterion about dependencies flowing toward the core.
 */

// ── Tuning knobs ──────────────────────────────────────────────────────────────
//
// One place, on purpose. These are defaults chosen WITHOUT having read the
// corpus, which the ticket is explicit about: "do not tune against a corpus you
// have not read." `npm run oracle:ask` exists to read it.
//
// The number that actually matters is MIN_SIMILARITY, and the honest way to set
// it is to ask something the corpus does NOT cover and see what that scores —
// the floor belongs above a non-match, not below a good match.

/** How many passages a retrieval returns at most. */
export const TOP_K = 6;

/**
 * Cosine similarity below which a passage is not worth showing.
 *
 * Provisional. Set from the corpus with `npm run oracle:ask`, and record the
 * number it was tuned against when you change it.
 */
export const MIN_SIMILARITY = 0.3;

/**
 * How many sources the reference list names at most.
 *
 * Ten references under a three-sentence answer reads as noise rather than rigour
 * (code-health/06). Equal to {@link TOP_K} rather than below it, and the two must
 * be moved together: the cap is applied by *source*, so a passage whose source
 * did not make the cap is dropped with it. Set to 5 against a TOP_K of 6, six
 * hits from six distinct sources silently returned five passages — a
 * result-shrinking knob nobody asked for. At TOP_K it can never bind, because
 * six hits cannot name more than six sources; raise TOP_K and it starts to.
 */
export const MAX_CITATIONS = TOP_K;

// ── The ports ─────────────────────────────────────────────────────────────────

/**
 * A source of the corpus, as retrieval needs one.
 *
 * Declared here rather than imported as `KnowledgeSourceRow`: this module is the
 * pure core of the Oracle, and the core imports nothing from the database layer
 * (AGENTS.md). The row satisfies it structurally, so the repository still hands
 * its rows straight in — what changes is which way the dependency points.
 */
export interface KnowledgeSource {
  id: string;
  slug: string;
  title: string;
  authors: string;
  year: number;
  doi: string | null;
  pmcid: string | null;
  licence: string;
  licenceUrl: string;
  attribution: string;
}

/** One chunk the vector search matched, with the source it belongs to. */
export interface ChunkSearchResult {
  text: string;
  ordinal: number;
  /** Cosine similarity in [0, 1] — already converted from distance. */
  similarity: number;
  source: KnowledgeSource;
}

/**
 * The read side of the corpus.
 *
 * Deliberately separate from `ingest.ts`'s `KnowledgeRepository`, which is a
 * write port and should not grow a read method just because both touch the same
 * two tables.
 */
export interface KnowledgeSearch {
  searchChunks(embedding: number[], limit: number): Promise<ChunkSearchResult[]>;
}

// ── The citation shape ────────────────────────────────────────────────────────

/**
 * One source the Coach drew on.
 *
 * **The app builds this, never the model.** That is the whole decision recorded
 * in code-health/06: an inline underlined span would be a claim about a range of
 * characters in text the model generated, which only the model can mark — and a
 * model that writes its own citations can write one for a claim it invented. A
 * fabricated citation is worse than none, because the citation is itself a trust
 * signal. Here the app already knows which passages retrieval supplied and
 * renders that list itself, so a citation cannot be fabricated: the model is not
 * the one producing it.
 *
 * The cost is precision. This says "these sources were in front of me", not
 * "this sentence came from source 3" — so whatever renders it must not be
 * labelled in a way that implies claim-level attribution. "What I drew on" is
 * honest; "Sources" overstates it.
 *
 * `ordinals` is carried because `knowledge_chunks.ordinal` exists precisely to
 * keep a chunk resolvable to its place in the article. Nothing reads it yet; it
 * is what an inline-anchoring upgrade would need, and it costs one column.
 */
export interface Citation {
  sourceId: string;
  slug: string;
  title: string;
  authors: string;
  year: number;
  /** Where to send the reader, or null when the source has no stable link. */
  url: string | null;
  licence: string;
  licenceUrl: string;
  /** Ready to display beside the passage — CC BY requires it. */
  attribution: string;
  /** Which chunks of this source were retrieved, ascending. */
  ordinals: number[];
}

/** One retrieved passage, pointing at the source it came from. */
export interface RetrievedPassage {
  text: string;
  similarity: number;
  ordinal: number;
  /** Resolves against `RetrievalResult.citations` — always present there. */
  sourceId: string;
}

export interface RetrievalResult {
  passages: RetrievedPassage[];
  /** Deduplicated by source, best-ranked first, capped at {@link MAX_CITATIONS}. */
  citations: Citation[];
}

/**
 * Where a citation points.
 *
 * DOI first because it is the stable identifier a paper is meant to be cited by;
 * PMC second because every source in this corpus reached us through it; null
 * third. A source with no link gets a defined absence — the renderer shows the
 * title unlinked — rather than a dead entry, which is the thing code-health/06
 * asked to be decided rather than discovered.
 */
export function citationUrl(source: KnowledgeSource): string | null {
  if (source.doi) return `https://doi.org/${source.doi}`;
  if (source.pmcid) return `https://www.ncbi.nlm.nih.gov/pmc/articles/${source.pmcid}/`;
  return null;
}

/**
 * The sources worth citing, in rank order, capped.
 *
 * Capping by *source* rather than trimming the finished citation list is what
 * keeps the reference list honest: a passage whose source did not make the cap
 * is dropped with it, so everything shown is accounted for by a citation that is
 * actually displayed. An uncited passage would be a claim with no provenance,
 * which is the failure this whole channel exists to prevent.
 */
function cappedSourceIds(
  ranked: readonly ChunkSearchResult[],
  maxCitations: number,
): string[] {
  const ids: string[] = [];
  for (const hit of ranked) {
    if (ids.length >= maxCitations) break;
    if (!ids.includes(hit.source.id)) ids.push(hit.source.id);
  }
  return ids;
}

/** One source's citation, built from the passages that came from it. */
function citationFor(sourceId: string, passages: readonly ChunkSearchResult[]): Citation {
  const fromSource = passages.filter((p) => p.source.id === sourceId);
  const { source } = fromSource[0];

  return {
    sourceId: source.id,
    slug: source.slug,
    title: source.title,
    authors: source.authors,
    year: source.year,
    url: citationUrl(source),
    licence: source.licence,
    licenceUrl: source.licenceUrl,
    attribution: source.attribution,
    // Ascending by position in the article, not by rank — a reader scanning the
    // paper reads forwards.
    ordinals: fromSource.map((p) => p.ordinal).sort((a, b) => a - b),
  };
}

export interface RetrieveOptions {
  embedder: Embedder;
  search: KnowledgeSearch;
  query: OracleQuery;
  topK?: number;
  minSimilarity?: number;
  maxCitations?: number;
}

const EMPTY: RetrievalResult = { passages: [], citations: [] };

/**
 * Embed the query, search the corpus, and return what was found with the
 * citations behind it.
 *
 * Retrieval finding nothing is an ordinary outcome, not a failure: an empty
 * result comes back and the caller decides what to say. Ticket 06 depends on the
 * Coach behaving well when the corpus is silent, and a throw here would make
 * that the caller's problem in the wrong way.
 */
export async function retrievePassages({
  embedder,
  search,
  query,
  topK = TOP_K,
  minSimilarity = MIN_SIMILARITY,
  maxCitations = MAX_CITATIONS,
}: RetrieveOptions): Promise<RetrievalResult> {
  // A blank question has no vector worth asking for. Returning early keeps the
  // embedder — and the money — out of a call that could only return noise.
  if (query.question.trim() === '') return EMPTY;

  const [embedding] = await embedder.embed([buildOracleQuery(query)]);
  if (!embedding) return EMPTY;

  const hits = await search.searchChunks(embedding, topK);

  const ranked = hits
    .filter((h) => h.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  const keptSourceIds = cappedSourceIds(ranked, maxCitations);
  const passages = ranked.filter((h) => keptSourceIds.includes(h.source.id));
  const citations = keptSourceIds.map((id) => citationFor(id, passages));

  return {
    passages: passages.map((p) => ({
      text: p.text,
      similarity: p.similarity,
      ordinal: p.ordinal,
      sourceId: p.source.id,
    })),
    citations,
  };
}
