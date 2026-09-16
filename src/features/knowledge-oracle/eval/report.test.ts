import { describe, it, expect } from 'vitest';
import { renderReport, type RunHeader } from './report';
import type { GenerationRecord, RetrievalRecord } from './metrics';
import type { Citation } from '@/lib/citation';

const header: RunHeader = {
  date: '2026-09-16',
  label: 'first',
  corpusSources: 34,
  corpusChunks: 1815,
  manifestCommit: '830604c',
  minSimilarity: 0.43,
  topK: 6,
  model: 'claude-sonnet-5',
  notes: ['OPENAI_API_KEY is the 7-day key, expires ~2026-09-22'],
};

const cite = (sourceId: string): Citation => ({
  sourceId,
  slug: sourceId,
  title: 'T',
  authors: 'A',
  year: 2020,
  url: null,
  licence: 'CC BY',
  licenceUrl: 'u',
  attribution: 'x',
  ordinals: [3],
});

const retrieval: RetrievalRecord[] = [
  {
    id: 'A1',
    group: 'answerable',
    question: 'taper?',
    expected: ['taper-2023'],
    raw: [{ slug: 'taper-2023', similarity: 0.61, ordinal: 4 }],
    kept: [{ slug: 'taper-2023', similarity: 0.61, ordinal: 4 }],
    citations: ['taper-2023'],
  },
  {
    id: 'O1',
    group: 'outside',
    question: 'shoes?',
    expected: [],
    raw: [{ slug: 'running-economy', similarity: 0.39, ordinal: 1 }],
    kept: [],
    citations: [],
  },
];

const generation: GenerationRecord[] = [
  { id: 'A1', group: 'answerable', question: 'taper?', turn: 1, toolCalls: 1, citations: [cite('taper-2023')], mentions: [], text: 'Cut volume, keep intensity.', failed: false, expectNoLookup: false },
  { id: 'O1', group: 'outside', question: 'shoes?', turn: 1, toolCalls: 1, citations: [], mentions: [], text: 'I have no grounding for that.', failed: false, expectNoLookup: false },
  { id: 'X6', group: 'adversarial', question: 'push through?', turn: 2, toolCalls: 1, citations: [], mentions: [], text: 'See a doctor.', failed: false, expectNoLookup: true },
];

const known = new Set(['taper-2023']);

describe('renderReport', () => {
  const md = renderReport({ header, retrieval, generation, knownSourceIds: known });

  it('opens with the run header: date, corpus state, constants and model', () => {
    expect(md).toContain('2026-09-16');
    expect(md).toContain('34 sources / 1,815 chunks');
    expect(md).toContain('830604c');
    expect(md).toContain('MIN_SIMILARITY = 0.43');
    expect(md).toContain('TOP_K = 6');
    expect(md).toContain('claude-sonnet-5');
    expect(md).toContain('expires ~2026-09-22');
  });

  it('reports the retrieval metrics', () => {
    expect(md).toMatch(/hit rate.*1\.00/i);
    expect(md).toMatch(/MRR.*1\.00/i);
    expect(md).toMatch(/floor[\s\S]*0\.61[\s\S]*0\.39/i);
  });

  it('marks structural failures inline on the record that carries them', () => {
    expect(md).toMatch(/X6.*lookup-on-non-claim/);
    expect(md).not.toMatch(/A1.*lookup-on-non-claim/);
  });

  it('puts every outside and adversarial reply under "Needs a human", verbatim, and not the answerable ones', () => {
    const humanSection = md.slice(md.indexOf('## Needs a human'));
    expect(humanSection).toContain('I have no grounding for that.');
    expect(humanSection).toContain('See a doctor.');
    expect(humanSection).not.toContain('Cut volume, keep intensity.');
  });

  it('shouts FAIL at the top when any citation does not resolve', () => {
    const bad = renderReport({
      header,
      retrieval,
      generation: [{ ...generation[0], citations: [cite('ghost')] }],
      knownSourceIds: known,
    });
    expect(bad.split('\n').slice(0, 6).join('\n')).toContain('FAIL');
    expect(md.split('\n').slice(0, 6).join('\n')).not.toContain('FAIL');
  });

  it('renders a retrieval-only run without a generation section or a human section', () => {
    const only = renderReport({ header, retrieval, generation: [], knownSourceIds: known });
    expect(only).toContain('hit rate');
    expect(only).not.toContain('## Needs a human');
  });
});
