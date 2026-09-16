import { describe, it, expect } from 'vitest';
import {
  LOOKUP_TOOL,
  LOOKUP_TOOL_NAME,
  NO_PASSAGES_RESULT,
  parseLookupInput,
  renderPassages,
  sourceMentions,
} from './lookup-tool';
import type { RetrievalResult } from './retrieval';

/**
 * `knowledge-oracle/05` — the tool the Coach calls when it wants grounding.
 *
 * Pure throughout: the description the model reads, the shape of what it sends
 * back, how passages are rendered for it, and the check on its prose.
 */
const citation = {
  sourceId: 's1',
  slug: 'seiler-2010',
  title: 'What is best practice for training intensity distribution?',
  authors: 'Seiler S',
  year: 2010,
  url: null,
  licence: 'CC BY',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Seiler 2010, CC BY',
  ordinals: [3, 7],
};

const result: RetrievalResult = {
  passages: [
    { text: 'Roughly 80 % of sessions below the first threshold.', similarity: 0.71, ordinal: 3, sourceId: 's1' },
    { text: 'High-intensity work is most effective in small doses.', similarity: 0.62, ordinal: 7, sourceId: 's1' },
  ],
  citations: [citation],
};

describe('LOOKUP_TOOL — what the model is told', () => {
  it('is named for the seam the services route on', () => {
    expect(LOOKUP_TOOL.name).toBe(LOOKUP_TOOL_NAME);
    expect(LOOKUP_TOOL_NAME).toBe('look_up_training_science');
  });

  it('asks for a question and nothing else', () => {
    expect(LOOKUP_TOOL.input_schema).toMatchObject({
      type: 'object',
      required: ['question'],
      additionalProperties: false,
    });
  });

  it('says when to call it — and, in the same breath, when not to', () => {
    // The gate is the description. It has to name both sides or the model will
    // look things up on "felt great" (Mads, 2026-09-11: retrieval is for
    // claims, not chatter).
    const d = LOOKUP_TOOL.description.toLowerCase();
    expect(d).toContain('before');
    expect(d).toContain('training-science');
    expect(d).toContain('not');
    for (const off of ['feel', 'logistics', 'schedul']) expect(d).toContain(off);
  });
});

describe('parseLookupInput', () => {
  it('accepts an object with a non-empty question', () => {
    expect(parseLookupInput({ question: 'why is Thursday easy?' })).toBe('why is Thursday easy?');
  });

  it('returns null for anything else, never throwing', () => {
    for (const bad of [null, undefined, 'why?', 42, {}, { question: '' }, { question: '   ' }, { q: 'x' }]) {
      expect(parseLookupInput(bad)).toBeNull();
    }
  });
});

describe('renderPassages — what the Coach reads back', () => {
  it('numbers the passages in rank order with their source, and nothing about how to cite', () => {
    const text = renderPassages(result);
    expect(text).toContain('[1] Seiler S (2010) — Roughly 80 % of sessions below the first threshold.');
    expect(text).toContain('[2] Seiler S (2010) — High-intensity work is most effective in small doses.');
    expect(text.indexOf('[1]')).toBeLessThan(text.indexOf('[2]'));
    expect(text.split('\n')).toHaveLength(2);
    expect(text.toLowerCase()).not.toContain('cite');
  });

  it('tells the Coach it has no grounding when nothing came back, and not to assert the claim', () => {
    const text = renderPassages({ passages: [], citations: [] });
    expect(text).toBe(NO_PASSAGES_RESULT);
    expect(text).toContain('do not have grounding');
    expect(text).toContain('do not state it as fact');
  });

  it('names a passage whose source is missing from the citations honestly rather than crashing', () => {
    const orphan: RetrievalResult = { passages: [{ ...result.passages[0], sourceId: 'gone' }], citations: [] };
    expect(renderPassages(orphan)).toContain('[1] Unknown source — Roughly 80 %');
  });
});

describe('sourceMentions — the silence check', () => {
  it('names the patterns the instruction forbids', () => {
    expect(sourceMentions('Keep Thursday easy [1].')).toEqual(['bracket-marker']);
    expect(sourceMentions('Keep it easy (source: Seiler 2010).')).toEqual(['source-parenthetical']);
    expect(sourceMentions('According to the study, polarised works.')).toEqual(['according-to-study']);
    expect(sourceMentions('As cited above, go easy.')).toEqual(['as-cited']);
  });

  it('reports several patterns once each, in a stable order', () => {
    expect(sourceMentions('According to the paper [2], as cited (source: X)')).toEqual([
      'bracket-marker',
      'source-parenthetical',
      'according-to-study',
      'as-cited',
    ]);
  });

  it('is silent on ordinary coaching prose, including the word source used plainly', () => {
    expect(sourceMentions('Oats are a good source of slow carbs before a long ride.')).toEqual([]);
    expect(sourceMentions('Thursday is easy because Wednesday was hard. Trust the week.')).toEqual([]);
    expect(sourceMentions('')).toEqual([]);
  });
});
