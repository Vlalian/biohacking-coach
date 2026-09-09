import { describe, it, expect } from 'vitest';
import type { Citation } from '@/lib/citation';
import type { RetrievalResult } from '@/features/knowledge-oracle/retrieval';
import { citationsFrom } from './citations';

function citation(over: Partial<Citation> = {}): Citation {
  return {
    sourceId: 'src_1',
    slug: 'polarized-training',
    title: 'Polarized training intensity distribution',
    authors: 'Seiler S',
    year: 2019,
    url: 'https://doi.org/10.1000/example',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Seiler S (2019), CC BY 4.0',
    ordinals: [3, 7],
    ...over,
  };
}

describe('citationsFrom', () => {
  it('carries the retrieval result’s citations through unchanged', () => {
    const retrieval: RetrievalResult = {
      passages: [{ text: 'p', similarity: 0.8, ordinal: 3, sourceId: 'src_1' }],
      citations: [citation()],
    };

    // Unchanged is the whole contract: retrieval.ts already deduplicated by
    // source, ordered by rank and capped at MAX_CITATIONS. Doing any of that
    // again here is how a cap ends up applied to the wrong thing.
    expect(citationsFrom(retrieval)).toEqual([citation()]);
  });

  it('is empty when retrieval returned nothing', () => {
    expect(citationsFrom({ passages: [], citations: [] })).toEqual([]);
    expect(citationsFrom(null)).toEqual([]);
  });

  // The anti-fabrication guarantee the whole design rests on. A model that
  // writes its own citations can write one for a claim it invented, so the app
  // renders only what retrieval actually supplied. It is enforced by the
  // signature rather than by a rule: `citationsFrom` never receives the reply,
  // so there is no text for a reference to be read out of. The service test
  // below holds the other half — that a reply full of plausible references
  // still reaches the transcript with none attached.
  it('takes only a retrieval result, so there is no text to mine', () => {
    expect(citationsFrom.length).toBe(1);
  });
});
