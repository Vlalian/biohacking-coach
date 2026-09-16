import type { CoachMessage, CoachReply, CoachTool, CoachToolCall } from '@/features/coach/coach-client';
import { createGrounding, type LookupRecord } from '@/features/coach/grounding';
import type { Embedder } from '../embedder';
import { sourceMentions } from '../lookup-tool';
import { retrievePassages, MIN_SIMILARITY, TOP_K, type KnowledgeSearch } from '../retrieval';
import { EVAL_SET, isConversation, questionOf, type EvalCase } from './eval-set';
import type { GenerationRecord, RetrievalRecord } from './metrics';

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
  minSimilarity?: number;
  topK?: number;
}

/**
 * One embedding per single-turn question. The search runs unfloored so the
 * record carries the raw ranking — where the weak matches score is what
 * decides the floor — and the floor is applied here to say what the Coach
 * would actually have read.
 */
export async function runRetrieval(set: readonly EvalCase[], ports: RetrievalPorts): Promise<RetrievalRecord[]> {
  const floor = ports.minSimilarity ?? MIN_SIMILARITY;
  const topK = ports.topK ?? TOP_K;
  const records: RetrievalRecord[] = [];

  for (const c of set) {
    if (isConversation(c) || c.question.trim() === '') continue;
    const result = await retrievePassages({
      embedder: ports.embedder,
      search: ports.search,
      query: { question: c.question },
      topK,
      minSimilarity: 0,
    });
    const slugOf = new Map(result.citations.map((cite) => [cite.sourceId, cite.slug]));
    const raw = result.passages.map((p) => ({
      slug: slugOf.get(p.sourceId) ?? p.sourceId,
      similarity: p.similarity,
      ordinal: p.ordinal,
    }));
    const kept = raw.filter((h) => h.similarity >= floor);
    records.push({
      id: c.id,
      group: c.group,
      question: c.question,
      expected: c.expected,
      raw,
      kept,
      citations: [...new Set(kept.map((h) => h.slug))],
    });
  }
  return records;
}

export interface GenerationPorts {
  embedder: Embedder;
  search: KnowledgeSearch;
  callCoach: (input: {
    system: string;
    messages: CoachMessage[];
    maxTokens: number;
    tools?: readonly CoachTool[];
    resolveTool?: (call: CoachToolCall) => Promise<string>;
  }) => Promise<CoachReply>;
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
 * nothing" is a result worth keeping.
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

  const turn = async (
    id: string,
    group: GenerationRecord['group'],
    question: string,
    messages: CoachMessage[],
    turnNo: 1 | 2,
    expectNoLookup: boolean,
  ): Promise<string> => {
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
      });
      return '';
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
    });
    return reply.text;
  };

  for (const c of set) {
    if (!isConversation(c)) {
      await turn(c.id, c.group, c.question, [{ role: 'user', content: c.question }], 1, false);
      continue;
    }
    const first = questionOf(universe, c.turn1);
    const reply1 = await turn(c.id, c.group, first, [{ role: 'user', content: first }], 1, c.expectNoLookup);
    await turn(
      c.id,
      c.group,
      c.turn2,
      [
        { role: 'user', content: first },
        { role: 'assistant', content: reply1 },
        { role: 'user', content: c.turn2 },
      ],
      2,
      c.expectNoLookup,
    );
  }

  return { records, lookups };
}
