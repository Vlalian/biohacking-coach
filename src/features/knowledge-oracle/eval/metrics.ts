import type { Citation } from '@/lib/citation';
import type { EvalGroup } from './eval-set';

/**
 * What a run records, and the numbers a machine can draw from it
 * (`knowledge-oracle/06`).
 *
 * Two record shapes for the two halves. The retrieval half costs an embedding
 * per question and answers "did the right source come back?". The generation
 * half costs a Coach call per turn and answers the structural questions — did
 * a citation resolve, did the prose name a source, did the Coach look
 * something up when it must not. **Whether the Coach was honest is not in
 * here**: that is a judgement about model prose, and it stays a human's.
 * Pure: records in, numbers out.
 */

export interface RankedHit {
  slug: string;
  similarity: number;
  ordinal: number;
}

export interface RetrievalRecord {
  id: string;
  group: EvalGroup;
  question: string;
  expected: readonly string[];
  /** Every passage the search returned, best first, before the floor. */
  raw: RankedHit[];
  /** The passages at or above `MIN_SIMILARITY` — what the Coach would read. */
  kept: RankedHit[];
  /** Slugs of the kept passages' sources, deduplicated, rank order. */
  citations: string[];
}

export interface GenerationRecord {
  id: string;
  group: EvalGroup;
  question: string;
  turn: 1 | 2;
  toolCalls: number;
  /** Exactly what would have been stored on the reply. */
  citations: Citation[];
  /** From `sourceMentions` — pattern names, never text. */
  mentions: string[];
  /** The reply, verbatim, for a human to read. */
  text: string;
  failed: boolean;
  expectNoLookup: boolean;
  /**
   * True when the question asked has no answer in the corpus — an `outside`
   * record, or either turn of an adversarial case that opens on one (X1 is O7
   * under another id, and a citation is the same failure under either).
   */
  outsideCorpus: boolean;
  /** An adversarial case's stated pass condition, for the human reading the reply. */
  passCondition?: string;
}

/** Fraction of answerable records with an expected slug among the citations. */
export function hitRate(records: readonly RetrievalRecord[]): number {
  const answerable = records.filter((r) => r.group === 'answerable');
  if (answerable.length === 0) return 0;
  const hits = answerable.filter((r) => r.expected.some((slug) => r.citations.includes(slug)));
  return hits.length / answerable.length;
}

/**
 * Mean reciprocal rank of the first expected slug in the raw ranking, with
 * each source counted once — two chunks of the same paper at ranks 1 and 2 are
 * one source at rank 1, because that is how the reference list shows them.
 */
export function mrr(records: readonly RetrievalRecord[]): number {
  const answerable = records.filter((r) => r.group === 'answerable');
  if (answerable.length === 0) return 0;
  const sum = answerable.reduce((acc, r) => {
    const sources = [...new Set(r.raw.map((h) => h.slug))];
    const rank = sources.findIndex((slug) => r.expected.includes(slug));
    return acc + (rank === -1 ? 0 : 1 / (rank + 1));
  }, 0);
  return sum / answerable.length;
}

export interface FloorSeparation {
  /** The lowest similarity the floor kept on an answerable question. */
  worstKept: number;
  /** The highest similarity any outside question scored, floor or no floor. */
  bestOutside: number;
  /** `worstKept - bestOutside`; negative means the floor cannot separate them. */
  gap: number;
}

/**
 * Where the floor sits relative to the data. The gap is reported, never
 * judged: a negative gap is the chunking finding from the smoke run, and the
 * suite's job is to show it, not to move `MIN_SIMILARITY`.
 */
export function floorSeparation(records: readonly RetrievalRecord[]): FloorSeparation | null {
  const kept = records.filter((r) => r.group === 'answerable').flatMap((r) => r.kept.map((h) => h.similarity));
  const outside = records.filter((r) => r.group === 'outside').flatMap((r) => r.raw.map((h) => h.similarity));
  if (kept.length === 0 || outside.length === 0) return null;
  const worstKept = Math.min(...kept);
  const bestOutside = Math.max(...outside);
  return { worstKept, bestOutside, gap: round(worstKept - bestOutside) };
}

export type StructuralFailure =
  | 'call-failed'
  | 'citation-unresolved'
  | 'source-mention'
  | 'citation-on-outside-question'
  | 'lookup-on-non-claim';

/**
 * The checks a machine can make on one generation record, all of them, in a
 * stable order. Empty means nothing structural is wrong — which is not the
 * same as the reply being right.
 */
export function structural(record: GenerationRecord, knownSourceIds: ReadonlySet<string>): StructuralFailure[] {
  return CHECKS.filter(([, failed]) => failed(record, knownSourceIds)).map(([name]) => name);
}

const CHECKS: readonly (readonly [StructuralFailure, (r: GenerationRecord, known: ReadonlySet<string>) => boolean])[] = [
  ['call-failed', (r) => r.failed],
  ['citation-unresolved', (r, known) => r.citations.some((c) => !known.has(c.sourceId))],
  ['source-mention', (r) => r.mentions.length > 0],
  ['citation-on-outside-question', (r) => r.outsideCorpus && r.citations.length > 0],
  ['lookup-on-non-claim', (r) => r.expectNoLookup && r.toolCalls > 0],
];

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
