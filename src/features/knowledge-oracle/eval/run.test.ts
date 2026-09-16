import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRetrieval, runGeneration } from './run';
import type { EvalCase } from './eval-set';
import type { ChunkSearchResult, KnowledgeSearch } from '../retrieval';
import type { Embedder } from '../embedder';
import type { CoachReply } from '@/features/coach/coach-client';
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

  it('skips a blank question without embedding it', async () => {
    const blank: EvalCase = { id: 'A0', group: 'answerable', question: '   ', expected: ['x'], nearest: null };
    const records = await runRetrieval([blank], { embedder: { embed }, search: { searchChunks } });
    expect(records).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });
});

describe('runGeneration', () => {
  const callCoach = vi.fn<(input: { messages: { role: string; content: string }[]; tools?: readonly unknown[]; resolveTool?: (c: { name: string; input: unknown }) => Promise<string> }) => Promise<CoachReply>>();

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
    expect(callCoach.mock.calls[0][0].tools).toHaveLength(1);
    const a1 = run.records[0];
    expect(a1).toMatchObject({ id: 'A1', turn: 1, toolCalls: 1, mentions: [], text: 'grounded reply', failed: false });
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
    expect(run.records[0]).toMatchObject({ id: 'A1', failed: true, toolCalls: 0, citations: [] });
    expect(run.records[0].text).toContain('CALL FAILED');
    expect(run.records[1]).toMatchObject({ id: 'O1', failed: false });
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
