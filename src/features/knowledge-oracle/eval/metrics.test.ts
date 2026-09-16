import { describe, it, expect } from 'vitest';
import {
  hitRate,
  mrr,
  floorSeparation,
  structural,
  type RetrievalRecord,
  type GenerationRecord,
} from './metrics';
import type { Citation } from '@/lib/citation';

const ret = (over: Partial<RetrievalRecord>): RetrievalRecord => ({
  id: 'A1',
  group: 'answerable',
  question: 'q',
  expected: ['taper-2023'],
  raw: [],
  kept: [],
  citations: [],
  ...over,
});

const hit = (slug: string, similarity: number) => ({ slug, similarity, ordinal: 1 });

const cite = (sourceId: string, slug = sourceId): Citation => ({
  sourceId,
  slug,
  title: 't',
  authors: 'a',
  year: 2020,
  url: null,
  licence: 'CC BY',
  licenceUrl: 'u',
  attribution: 'x',
  ordinals: [1],
});

const gen = (over: Partial<GenerationRecord>): GenerationRecord => ({
  id: 'A1',
  group: 'answerable',
  question: 'q',
  turn: 1,
  toolCalls: 1,
  citations: [cite('s1')],
  mentions: [],
  text: 'reply',
  failed: false,
  expectNoLookup: false,
  outsideCorpus: false,
  ...over,
});

describe('hitRate and mrr — did the right source come back?', () => {
  it('counts a record as a hit when any expected slug is among its citations', () => {
    const records = [
      ret({ citations: ['taper-2023'] }),
      ret({ id: 'A2', citations: ['other'] }),
      ret({ id: 'A3', expected: ['a', 'b'], citations: ['x', 'b'] }),
    ];
    expect(hitRate(records)).toBeCloseTo(2 / 3);
  });

  it('ignores outside records — they have nothing to hit', () => {
    expect(hitRate([ret({ group: 'outside', expected: [] })])).toBe(0);
    expect(hitRate([ret({ citations: ['taper-2023'] }), ret({ id: 'O1', group: 'outside', expected: [] })])).toBe(1);
  });

  it('ranks by the first expected slug in the raw order, counting each source once', () => {
    const records = [
      ret({ raw: [hit('x', 0.6), hit('x', 0.59), hit('taper-2023', 0.5)] }), // rank 2, not 3
      ret({ id: 'A2', raw: [hit('taper-2023', 0.7)] }), // rank 1
      ret({ id: 'A3', raw: [hit('x', 0.7)] }), // absent
    ];
    expect(mrr(records)).toBeCloseTo((1 / 2 + 1 + 0) / 3);
  });

  it('is zero on an empty set rather than NaN', () => {
    expect(hitRate([])).toBe(0);
    expect(mrr([])).toBe(0);
  });
});

describe('floorSeparation — where the floor sits', () => {
  it('reports the worst kept in-corpus similarity, the best outside similarity, and the gap', () => {
    const records = [
      ret({ kept: [hit('taper-2023', 0.6), hit('taper-2023', 0.45)] }),
      ret({ id: 'O1', group: 'outside', expected: [], raw: [hit('x', 0.42), hit('y', 0.3)] }),
    ];
    expect(floorSeparation(records)).toEqual({ worstKept: 0.45, bestOutside: 0.42, gap: 0.03 });
  });

  it('reports a negative gap rather than hiding it — that is the chunking finding', () => {
    const records = [
      ret({ kept: [hit('taper-2023', 0.44)] }),
      ret({ id: 'O1', group: 'outside', expected: [], raw: [hit('x', 0.5)] }),
    ];
    expect(floorSeparation(records)?.gap).toBeCloseTo(-0.06);
  });

  it('takes the worst of the kept and the best of the outside, whatever order they arrive in', () => {
    const records = [
      ret({ kept: [hit('taper-2023', 0.5), hit('taper-2023', 0.7)] }),
      ret({ id: 'A2', kept: [hit('taper-2023', 0.55)] }),
      ret({ id: 'O1', group: 'outside', expected: [], raw: [hit('x', 0.3), hit('y', 0.41)] }),
      ret({ id: 'O2', group: 'outside', expected: [], raw: [hit('x', 0.2)] }),
    ];
    expect(floorSeparation(records)).toEqual({ worstKept: 0.5, bestOutside: 0.41, gap: 0.09 });
  });

  it('reads only the answerable side for "kept" and only the outside side for "raw"', () => {
    const records = [
      ret({ kept: [hit('taper-2023', 0.6)], raw: [hit('taper-2023', 0.6), hit('z', 0.9)] }),
      ret({ id: 'O1', group: 'outside', expected: [], raw: [hit('x', 0.4)], kept: [hit('x', 0.1)] }),
    ];
    expect(floorSeparation(records)).toEqual({ worstKept: 0.6, bestOutside: 0.4, gap: 0.2 });
  });

  it('is null when either side is missing', () => {
    expect(floorSeparation([ret({ kept: [hit('a', 0.5)] })])).toBeNull();
    expect(floorSeparation([ret({ id: 'O1', group: 'outside', expected: [], raw: [hit('x', 0.4)] })])).toBeNull();
    expect(floorSeparation([])).toBeNull();
  });
});

describe('structural — the checks a machine can make', () => {
  const known = new Set(['s1', 's2']);

  it('passes an ordinary cited answer', () => {
    expect(structural(gen({}), known)).toEqual([]);
  });

  it('names a citation whose source is not in the corpus — the failure the ticket calls out', () => {
    expect(structural(gen({ citations: [cite('ghost')] }), known)).toEqual(['citation-unresolved']);
  });

  it('names a reply that mentions a source in its own words', () => {
    expect(structural(gen({ mentions: ['bracket-marker'] }), known)).toEqual(['source-mention']);
  });

  it('names a citation on an outside question — the floor let a passage through', () => {
    expect(structural(gen({ group: 'outside', outsideCorpus: true, citations: [cite('s1')] }), known)).toEqual([
      'citation-on-outside-question',
    ]);
  });

  it('names it just the same when the outside question opens an adversarial case — X1 is O7 under a different id', () => {
    expect(structural(gen({ group: 'adversarial', outsideCorpus: true, citations: [cite('s1')] }), known)).toEqual([
      'citation-on-outside-question',
    ]);
    expect(structural(gen({ group: 'adversarial', outsideCorpus: false, citations: [cite('s1')] }), known)).toEqual([]);
  });

  it('names a lookup on the case that must not look anything up', () => {
    expect(structural(gen({ group: 'adversarial', expectNoLookup: true, toolCalls: 1, citations: [] }), known)).toEqual([
      'lookup-on-non-claim',
    ]);
    expect(structural(gen({ group: 'adversarial', expectNoLookup: true, toolCalls: 0, citations: [] }), known)).toEqual([]);
  });

  it('names a failed call so it is never mistaken for a clean pass', () => {
    expect(structural(gen({ failed: true, citations: [] }), known)).toEqual(['call-failed']);
  });

  it('reports every failure, not the first', () => {
    const r = gen({ group: 'outside', outsideCorpus: true, citations: [cite('ghost')], mentions: ['as-cited'] });
    expect(structural(r, known)).toEqual(['citation-unresolved', 'source-mention', 'citation-on-outside-question']);
  });
});
