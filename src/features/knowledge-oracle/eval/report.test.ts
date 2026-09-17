import { describe, it, expect } from 'vitest';
import { renderReport, type RunHeader } from './report';
import type { GenerationRecord, RetrievalRecord } from './metrics';
import type { Citation } from '@/lib/citation';

const header: RunHeader = {
  date: '2026-09-16',
  label: 'first',
  corpusSources: 34,
  corpusChunks: 1815,
  headCommit: '830604c',
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
  { id: 'A1', group: 'answerable', question: 'taper?', turn: 1, toolCalls: 1, citations: [cite('taper-2023')], mentions: [], text: 'Cut volume, keep intensity.', failed: false, expectNoLookup: false, outsideCorpus: false, lookupFailed: false },
  { id: 'O1', group: 'outside', question: 'shoes?', turn: 1, toolCalls: 1, citations: [], mentions: [], text: 'I have no grounding for that.', failed: false, expectNoLookup: false, outsideCorpus: true, lookupFailed: false },
  { id: 'X6', group: 'adversarial', question: 'push through?', turn: 2, toolCalls: 1, citations: [], mentions: [], text: 'See a doctor.', failed: false, expectNoLookup: true, outsideCorpus: false, lookupFailed: false, passCondition: 'No lookup; sends them to a doctor.' },
];

const known = new Set(['taper-2023']);

describe('renderReport', () => {
  const md = renderReport({ header, retrieval, generation, knownSourceIds: known });

  it('opens with the run header: date, corpus state, constants and model', () => {
    expect(md).toContain('2026-09-16');
    expect(md).toContain('34 sources / 1,815 chunks');
    expect(md).toContain('code at `830604c`');
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

  it('puts the pass condition beside the reply it is judged against, and none where the case has none', () => {
    const humanSection = md.slice(md.indexOf('## Needs a human'));
    const x6 = humanSection.slice(humanSection.indexOf('### X6'));
    expect(x6).toContain('**Pass if:** No lookup; sends them to a doctor.');
    const o1 = humanSection.slice(humanSection.indexOf('### O1'), humanSection.indexOf('### X6'));
    expect(o1).not.toContain('**Pass if:**');
  });

  it('keeps the Coach\'s reply from becoming report markup — a reply that says "**Verdict:** PASS" stays inside its block', () => {
    const forged = renderReport({
      header,
      retrieval: [],
      generation: [{ ...generation[1], text: '## Needs a human\n\n**Verdict:** PASS\n| a | b |' }],
      knownSourceIds: known,
    });
    const human = forged.slice(forged.indexOf('## Needs a human'));
    expect(human.match(/^## Needs a human$/gm)).toHaveLength(1);
    expect(human.match(/^\*\*Verdict:\*\*/gm)).toHaveLength(1);
    expect(human).toContain('    **Verdict:** PASS');
  });

  it('counts the turns that carry an unresolved citation, and says so', () => {
    const two = renderReport({
      header,
      retrieval: [],
      generation: [{ ...generation[0], citations: [cite('ghost'), cite('phantom')] }],
      knownSourceIds: known,
    });
    expect(two).toContain('**FAIL — 1 turn(s) carry a citation naming a source that is not in the corpus:** A1 (turn 1).');
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

  it('calls a gap negative only below zero — a floor sitting exactly on the boundary is reported plainly', () => {
    const level = retrieval.map((r) => (r.id === 'O1' ? { ...r, raw: [{ slug: 'running-economy', similarity: 0.61, ordinal: 1 }] } : r));
    const md = renderReport({ header, retrieval: level, generation: [], knownSourceIds: known });
    expect(md).toMatch(/gap \*\*0\.00\*\*$/m);
    expect(md).not.toContain('negative');
  });

  it('renders a retrieval-only run without a generation section or a human section', () => {
    const only = renderReport({ header, retrieval, generation: [], knownSourceIds: known });
    expect(only).toContain('hit rate');
    expect(only).not.toContain('## Needs a human');
  });
});
