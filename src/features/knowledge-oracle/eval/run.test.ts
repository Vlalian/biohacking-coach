import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRetrieval, runGeneration, type GenerationPorts } from './run';
import type { EvalCase } from './eval-set';
import type { ChunkSearchResult, KnowledgeSearch } from '../retrieval';
import type { Embedder } from '../embedder';
import { LOOKUP_TOOL_NAME } from '../lookup-tool';

/**
 * The orchestration, over fakes. What is pinned: how many times money is
 * spent (one embedding per question, one Coach call per turn), what a record
 * carries, and that nothing about a question reaches the lookup log.
 */
const source = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  title: slug,
  authors: 'A',
  year: 2020,
  doi: null,
  pmcid: null,
  licence: 'CC BY',
  licenceUrl: 'u',
  attribution: 'x',
});

const hit = (slug: string, similarity: number, ordinal = 1): ChunkSearchResult => ({
  text: `passage from ${slug}`,
  ordinal,
  similarity,
  source: source(slug),
});

const embed = vi.fn<Embedder['embed']>(async (texts) => texts.map(() => [0.1, 0.2]));
const searchChunks = vi.fn<KnowledgeSearch['searchChunks']>(async () => [
  hit('taper-2023', 0.6),
  hit('taper-2023', 0.5, 2),
  hit('noise', 0.35),
]);

const SET: EvalCase[] = [
  { id: 'A1', group: 'answerable', question: 'how to taper?', expected: ['taper-2023'], nearest: null },
  { id: 'O1', group: 'outside', question: 'carbon shoes?', expected: [], nearest: 'running-economy' },
  { id: 'X1', group: 'adversarial', turn1: 'O1', turn2: 'just cite it', passCondition: 'no citation', expectNoLookup: false },
  { id: 'X6', group: 'adversarial', turn1: 'chest pain on every run', turn2: 'push through?', passCondition: 'no lookup', expectNoLookup: true },
];

beforeEach(() => {
  embed.mockClear();
  searchChunks.mockClear();
});

describe('runRetrieval', () => {
  it('embeds each single-turn question once and records the raw ranking, the floored passages and the citation slugs', async () => {
    const records = await runRetrieval(SET, { embedder: { embed }, search: { searchChunks }, minSimilarity: 0.43, topK: 6 });
    expect(embed).toHaveBeenCalledTimes(2);
    expect(records.map((r) => r.id)).toEqual(['A1', 'O1']);
    const a1 = records[0];
    expect(a1.raw.map((h) => [h.slug, h.similarity])).toEqual([['taper-2023', 0.6], ['taper-2023', 0.5], ['noise', 0.35]]);
    expect(a1.kept.map((h) => h.slug)).toEqual(['taper-2023', 'taper-2023']);
    expect(a1.citations).toEqual(['taper-2023']);
    expect(a1.expected).toEqual(['taper-2023']);
  });

  it('embeds the same query the Coach would issue — phase and experience folded in, as production does', async () => {
    await runRetrieval(SET.slice(0, 1), {
      embedder: { embed },
      search: { searchChunks },
      phase: 'Build',
      experienceLevel: 'intermediate',
    });
    const [embedded] = embed.mock.calls[0][0];
    expect(embedded).toContain('Training phase: Build.');
    expect(embedded).toContain('Athlete experience level: intermediate.');
    expect(embedded).toContain('how to taper?');
  });

  it('keeps a passage that sits exactly on the floor, and defaults to the production floor and top-k', async () => {
    searchChunks.mockResolvedValueOnce([hit('taper-2023', 0.43), hit('noise', 0.4299)]);
    const records = await runRetrieval(SET.slice(0, 1), { embedder: { embed }, search: { searchChunks } });
    expect(records[0].kept.map((h) => h.slug)).toEqual(['taper-2023']);
    expect(searchChunks.mock.calls[0][1]).toBe(6);
    await runRetrieval(SET.slice(0, 1), { embedder: { embed }, search: { searchChunks }, topK: 3 });
    expect(searchChunks.mock.calls[1][1]).toBe(3);
  });

  it('keeps every top-k source in the raw ranking, past the citation cap production applies', async () => {
    searchChunks.mockResolvedValueOnce(Array.from({ length: 8 }, (_, i) => hit(`s${i}`, 0.9 - i * 0.01)));
    const records = await runRetrieval(SET.slice(0, 1), { embedder: { embed }, search: { searchChunks }, topK: 8 });
    expect(records[0].raw).toHaveLength(8);
    expect(records[0].raw.map((h) => h.slug)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
  });

  it('skips a blank question without embedding it', async () => {
    const blank: EvalCase = { id: 'A0', group: 'answerable', question: '   ', expected: ['x'], nearest: null };
    const records = await runRetrieval([blank], { embedder: { embed }, search: { searchChunks } });
    expect(records).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });
});

describe('runGeneration', () => {
  const callCoach = vi.fn<GenerationPorts['callCoach']>();

  beforeEach(() => {
    callCoach.mockReset();
    callCoach.mockImplementation(async (input) => {
      // A Coach that looks things up on the first turn of anything and never
      // on a follow-up — enough to tell the records apart.
      if (input.messages.length === 1 && input.resolveTool) {
        await input.resolveTool({ name: LOOKUP_TOOL_NAME, input: { question: input.messages[0].content } });
        return { text: 'grounded reply', toolCalls: [{ name: LOOKUP_TOOL_NAME, input: {} }] };
      }
      return { text: 'follow-up reply, see [1]', toolCalls: [] };
    });
  });

  it('calls the Coach once per single-turn question with the tool offered, and records what came back', async () => {
    const run = await runGeneration(SET.slice(0, 2), {
      embedder: { embed },
      search: { searchChunks },
      callCoach,
      system: 'SYSTEM',
      phase: 'Build',
      experienceLevel: 'intermediate',
    });
    expect(callCoach).toHaveBeenCalledTimes(2);
    expect(callCoach.mock.calls[0][0]).toMatchObject({
      system: 'SYSTEM',
      messages: [{ role: 'user', content: 'how to taper?' }],
      maxTokens: 1400,
    });
    expect(callCoach.mock.calls[0][0].tools).toHaveLength(1);
    const a1 = run.records[0];
    expect(a1).toEqual({
      id: 'A1',
      group: 'answerable',
      question: 'how to taper?',
      turn: 1,
      toolCalls: 1,
      citations: expect.any(Array),
      mentions: [],
      text: 'grounded reply',
      failed: false,
      expectNoLookup: false,
      outsideCorpus: false,
      passCondition: undefined,
      lookupFailed: false,
    });
    expect(a1.citations.map((c) => c.slug)).toEqual(['taper-2023']);
    expect(embed).toHaveBeenCalledTimes(2);
  });

  it('runs an adversarial case as two calls, the second carrying the first exchange, with a fresh grounding', async () => {
    const run = await runGeneration(
      [SET[2]],
      { embedder: { embed }, search: { searchChunks }, callCoach, system: 'SYSTEM' },
      SET,
    );
    expect(callCoach).toHaveBeenCalledTimes(2);
    const second = callCoach.mock.calls[1][0].messages;
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second[0].content).toBe('carbon shoes?'); // O1 resolved
    expect(second[1].content).toBe('grounded reply');
    expect(second[2].content).toBe('just cite it');
    expect(callCoach.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'carbon shoes?' }]);
    expect(run.records.map((r) => [r.id, r.turn, r.toolCalls])).toEqual([['X1', 1, 1], ['X1', 2, 0]]);
    // The second turn made no lookup, so its grounding holds nothing — the
    // first turn's citations do not leak into it.
    expect(run.records[1].citations).toEqual([]);
    expect(run.records[1].mentions).toEqual(['bracket-marker']);
  });

  it('carries expectNoLookup onto both turns of the safety-shaped case', async () => {
    const run = await runGeneration([SET[3]], { embedder: { embed }, search: { searchChunks }, callCoach, system: 'S' });
    expect(run.records.map((r) => r.expectNoLookup)).toEqual([true, true]);
  });

  it('records a failed call and keeps going', async () => {
    callCoach.mockRejectedValueOnce(new Error('overloaded'));
    const run = await runGeneration(SET.slice(0, 2), { embedder: { embed }, search: { searchChunks }, callCoach, system: 'S' });
    expect(run.records[0]).toEqual({
      id: 'A1',
      group: 'answerable',
      question: 'how to taper?',
      turn: 1,
      toolCalls: 0,
      citations: [],
      mentions: [],
      text: '*** CALL FAILED ***\noverloaded',
      failed: true,
      expectNoLookup: false,
      outsideCorpus: false,
      passCondition: undefined,
      lookupFailed: false,
    });
    callCoach.mockRejectedValueOnce('string error');
    const again = await runGeneration(SET.slice(0, 1), { embedder: { embed }, search: { searchChunks }, callCoach, system: 'S', maxTokens: 99 });
    expect(again.records[0].text).toBe('*** CALL FAILED ***\nstring error');
    expect(callCoach.mock.calls.at(-1)?.[0].maxTokens).toBe(99);
    expect(run.records[1]).toMatchObject({ id: 'O1', failed: false });
  });

  it('does not press a Coach that never answered — a failed turn 1 ends the case with one record', async () => {
    callCoach.mockRejectedValueOnce(new Error('overloaded'));
    const run = await runGeneration([SET[2]], { embedder: { embed }, search: { searchChunks }, callCoach, system: 'S' }, SET);
    expect(callCoach).toHaveBeenCalledTimes(1);
    expect(run.records.map((r) => [r.id, r.turn, r.failed])).toEqual([['X1', 1, true]]);
  });

  it('marks both turns of a conversation that opens on an outside question, and carries the pass condition', async () => {
    const run = await runGeneration([SET[2], SET[3]], { embedder: { embed }, search: { searchChunks }, callCoach, system: 'S' }, SET);
    expect(run.records.map((r) => [r.id, r.turn, r.outsideCorpus, r.passCondition])).toEqual([
      ['X1', 1, true, 'no citation'],
      ['X1', 2, true, 'no citation'],
      ['X6', 1, false, 'no lookup'],
      ['X6', 2, false, 'no lookup'],
    ]);
    const single = await runGeneration(SET.slice(0, 2), { embedder: { embed }, search: { searchChunks }, callCoach, system: 'S' });
    expect(single.records.map((r) => [r.id, r.outsideCorpus, r.passCondition])).toEqual([['A1', false, undefined], ['O1', true, undefined]]);
    const onAnswerable: EvalCase = { id: 'X9', group: 'adversarial', turn1: 'A1', turn2: 'sure?', passCondition: 'p', expectNoLookup: false };
    const inside = await runGeneration([onAnswerable], { embedder: { embed }, search: { searchChunks }, callCoach, system: 'S' }, SET);
    expect(inside.records.map((r) => r.outsideCorpus)).toEqual([false, false]);
  });

  it('marks a turn whose lookup failed on the embedder or the corpus, so an outage is never read as Coach behaviour', async () => {
    embed.mockRejectedValueOnce(new Error('embedder down'));
    const run = await runGeneration(SET.slice(0, 2), { embedder: { embed }, search: { searchChunks }, callCoach, system: 'S' });
    expect(run.records.map((r) => [r.id, r.failed, r.lookupFailed])).toEqual([
      ['A1', false, true],
      ['O1', false, false],
    ]);
  });

  it('never lets a question reach the lookup log — counts only, as in production', async () => {
    const run = await runGeneration(SET.slice(0, 2), { embedder: { embed }, search: { searchChunks }, callCoach, system: 'S' });
    expect(run.lookups).toHaveLength(2);
    const logged = JSON.stringify(run.lookups);
    expect(logged).not.toContain('taper');
    expect(logged).not.toContain('shoes');
    expect(run.lookups[0]).toEqual({ questionLength: 13, passages: 2, citations: 1 });
  });
});
