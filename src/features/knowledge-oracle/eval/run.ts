import type { CoachMessage, CoachReply, callCoach } from '@/features/coach/coach-client';
import { createGrounding, type LookupRecord } from '@/features/coach/grounding';
import type { Embedder } from '../embedder';
import { sourceMentions } from '../lookup-tool';
import { retrievePassages, MIN_SIMILARITY, type KnowledgeSearch, type RetrievalResult } from '../retrieval';
import type { OracleQuery } from '../query';
import { EVAL_SET, isConversation, questionOf, type EvalCase, type EvalQuestion } from './eval-set';
import type { GenerationRecord, RankedHit, RetrievalRecord } from './metrics';

/**
 * The two halves of a run, over ports (`knowledge-oracle/06`).
 *
 * Ports, so the tests drive this with fakes and the CLI with the real
 * embedder, the real corpus and the real Coach. Nothing here touches the
 * database's athlete tables: there is no athlete. The lookup log is a list in
 * memory carrying the same counts-only shape as production's
 * `lookup_performed` event — the suite must not become the one place a
 * question gets written down.
 */

export interface RetrievalPorts {
  embedder: Embedder;
  search: KnowledgeSearch;
  /** The fixture athlete's, folded into the query exactly as the Coach's lookup folds them. */
  phase?: string | null;
  experienceLevel?: string | null;
  minSimilarity?: number;
  topK?: number;
}

/**
 * One embedding per single-turn question — the same query the Coach's lookup
 * would embed, phase and experience included, so the two halves of a run
 * measure one vector. The search runs unfloored so the record carries the raw
 * ranking — where the weak matches score is what decides the floor — and the
 * floor is applied here to say what the Coach would actually have read.
 */
export async function runRetrieval(set: readonly EvalCase[], ports: RetrievalPorts): Promise<RetrievalRecord[]> {
  const floor = ports.minSimilarity ?? MIN_SIMILARITY;
  const records: RetrievalRecord[] = [];

  for (const c of set) {
    if (isConversation(c) || c.question.trim() === '') continue;
    const result = await retrievePassages({
      embedder: ports.embedder,
      search: ports.search,
      query: queryFor(c.question, ports),
      topK: ports.topK,
      minSimilarity: 0,
    });
    records.push(retrievalRecord(c, rankedHits(result), floor));
  }
  return records;
}

/** The query as the Coach's lookup would build it — the fixture's phase and experience folded in. */
function queryFor(question: string, ports: RetrievalPorts): OracleQuery {
  return {
    question,
    phase: ports.phase ?? undefined,
    experienceLevel: ports.experienceLevel ?? undefined,
  };
}

/** The raw ranking, each passage named by its source's slug. */
function rankedHits(result: RetrievalResult): RankedHit[] {
  const slugOf = new Map(result.citations.map((cite) => [cite.sourceId, cite.slug]));
  return result.passages.map((p) => ({
    // Stryker disable next-line LogicalOperator — every passage's source is in `citations` by RetrievalResult's contract; the fallback cannot be reached
    slug: slugOf.get(p.sourceId) ?? p.sourceId,
    similarity: p.similarity,
    ordinal: p.ordinal,
  }));
}

function retrievalRecord(c: EvalQuestion, raw: RankedHit[], floor: number): RetrievalRecord {
  const kept = raw.filter((h) => h.similarity >= floor);
  return {
    id: c.id,
    group: c.group,
    question: c.question,
    expected: c.expected,
    raw,
    kept,
    citations: [...new Set(kept.map((h) => h.slug))],
  };
}

export interface GenerationPorts {
  embedder: Embedder;
  search: KnowledgeSearch;
  callCoach: (input: Parameters<typeof callCoach>[0]) => Promise<CoachReply>;
  system: string;
  phase?: string | null;
  experienceLevel?: string | null;
  maxTokens?: number;
}

export interface GenerationRun {
  records: GenerationRecord[];
  /** Counts only, as production records them — never a question. */
  lookups: LookupRecord[];
}

const DEFAULT_MAX_TOKENS = 1400;

/**
 * One Coach call per turn, with the lookup tool offered and a fresh grounding
 * each turn — exactly one per turn, as production. An adversarial case is two
 * calls; the second carries the first exchange so the Coach is pressed on what
 * it actually said. A failed call is a record, not an abort: "the Coach said
 * nothing" is a result worth keeping — but a case whose first turn failed is
 * not pressed further, since an empty assistant turn is a malformed request,
 * not a second failure of the Coach.
 */
export async function runGeneration(
  set: readonly EvalCase[],
  ports: GenerationPorts,
  // Where an adversarial case's `turn1` reference is looked up. The whole set
  // by default, so running one group alone still finds the question it points
  // at; the tests pass their own.
  universe: readonly EvalCase[] = EVAL_SET,
): Promise<GenerationRun> {
  const lookups: LookupRecord[] = [];
  const records: GenerationRecord[] = [];

  interface Turn {
    id: string;
    group: GenerationRecord['group'];
    question: string;
    messages: CoachMessage[];
    turnNo: 1 | 2;
    expectNoLookup: boolean;
    outsideCorpus: boolean;
    passCondition?: string;
  }

  /** The reply text, or null when the call failed. */
  const turn = async ({ id, group, question, messages, turnNo, expectNoLookup, outsideCorpus, passCondition }: Turn): Promise<string | null> => {
    const grounding = createGrounding({
      embedder: ports.embedder,
      search: ports.search,
      phase: ports.phase,
      experienceLevel: ports.experienceLevel,
      record: async (entry) => {
        lookups.push(entry);
      },
    });
    let reply: CoachReply;
    try {
      reply = await ports.callCoach({
        system: ports.system,
        messages,
        maxTokens: ports.maxTokens ?? DEFAULT_MAX_TOKENS,
        tools: [grounding.tool],
        resolveTool: grounding.resolve,
      });
    } catch (error) {
      records.push({
        id,
        group,
        question,
        turn: turnNo,
        toolCalls: 0,
        citations: [],
        mentions: [],
        text: `*** CALL FAILED ***\n${error instanceof Error ? error.message : String(error)}`,
        failed: true,
        expectNoLookup,
        outsideCorpus,
        passCondition,
      });
      return null;
    }
    records.push({
      id,
      group,
      question,
      turn: turnNo,
      toolCalls: reply.toolCalls.length,
      citations: grounding.citations(),
      mentions: sourceMentions(reply.text),
      text: reply.text,
      failed: false,
      expectNoLookup,
      outsideCorpus,
      passCondition,
    });
    return reply.text;
  };

  for (const c of set) {
    if (!isConversation(c)) {
      await turn({
        id: c.id,
        group: c.group,
        question: c.question,
        messages: [{ role: 'user', content: c.question }],
        turnNo: 1,
        expectNoLookup: false,
        outsideCorpus: c.group === 'outside',
      });
      continue;
    }
    const first = questionOf(universe, c.turn1);
    const shared = {
      id: c.id,
      group: c.group,
      expectNoLookup: c.expectNoLookup,
      outsideCorpus: opensOutside(universe, c.turn1),
      passCondition: c.passCondition,
    };
    const reply1 = await turn({ ...shared, question: first, messages: [{ role: 'user', content: first }], turnNo: 1 });
    if (reply1 === null) continue;
    await turn({
      ...shared,
      question: c.turn2,
      messages: [
        { role: 'user', content: first },
        { role: 'assistant', content: reply1 },
        { role: 'user', content: c.turn2 },
      ],
      turnNo: 2,
    });
  }

  return { records, lookups };
}

/** Whether an adversarial case's `turn1` reference names an outside question. */
function opensOutside(universe: readonly EvalCase[], ref: string): boolean {
  return universe.some((c) => c.id === ref && c.group === 'outside');
}
