import { describe, it, expect } from 'vitest';
import {
  CORPUS,
  admit,
  admitSource,
  admittedSources,
  SourceRefused,
  type CorpusSource,
} from './corpus-manifest';
import { isAdmissible } from './licence';

describe('the corpus register', () => {
  it('gives every admitted source an admissible licence, an attribution, and a pmcid', () => {
    const admitted = admittedSources();

    // 8 from issue 01, +10 by citation chaining, +13 by a gap-targeted PMC
    // search (all 2026-08-25). Pinned so
    // that growing the corpus is a deliberate edit to this test rather than a
    // silent widening — every added row is a licence someone signed off on.
    expect(admitted).toHaveLength(31);

    for (const source of admitted) {
      expect(isAdmissible(source.licence), `${source.slug} licence`).toBe(true);
      // The attribution is what CC BY actually requires, and it is stored on the
      // source row at ingest. A row without one produces a passage that cannot
      // be shown legally.
      expect(source.attribution.length, `${source.slug} attribution`).toBeGreaterThan(0);
      expect(source.licenceUrl, `${source.slug} licence url`).toMatch(/^https:\/\//);
      // The pmcid is how the fetch pass reaches full text; without it the source
      // is a citation with nothing behind it.
      expect(source.pmcid, `${source.slug} pmcid`).toMatch(/^PMC\d+$/);
    }
  });

  it('refuses every source the register marked out, naming it', () => {
    const out = CORPUS.filter((s) => s.verdict === 'out');
    expect(out.length).toBeGreaterThan(0);

    for (const source of out) {
      expect(() => admit(source.slug), source.slug).toThrow(SourceRefused);
      // The refusal has to say which source and why, or an operator reading a
      // failed ingest cannot act on it.
      expect(() => admit(source.slug)).toThrow(source.slug);
    }
  });

  it('prefers the register verdict over the licence string', () => {
    // The row the register does not contain: marked out, but carrying a licence
    // that would sail through `isAdmissible` on its own. The verdict must win —
    // it is a decision a human took with the publisher's policy page open, and
    // re-deriving it from one field would quietly overrule them.
    const contradictory: CorpusSource = {
      slug: 'ruled-out-but-cc-by',
      title: 'A source a human ruled out for a reason not visible in its licence',
      authors: 'Nobody',
      year: 2026,
      doi: '',
      pmcid: 'PMC0000000',
      licence: 'CC BY 4.0',
      licenceUrl: 'https://example.org/licence',
      attribution: 'Nobody (2026). Licensed CC BY 4.0.',
      territory: 'nothing',
      verdict: 'out',
      outReason: 'licence-unestablished',
      reason: 'The publisher policy page contradicted the article page.',
    };

    expect(isAdmissible(contradictory.licence)).toBe(true);
    expect(() => admitSource(contradictory)).toThrow(SourceRefused);
    expect(() => admitSource(contradictory)).toThrow('ruled-out-but-cc-by');
  });

  it('refuses a source it has never ruled on', () => {
    // Absence is not permission. A slug the register has never seen is refused
    // for a different reason than one it rejected, and says so.
    expect(() => admit('some-paper-nobody-checked')).toThrow(SourceRefused);
    expect(() => admit('some-paper-nobody-checked')).toThrow(/not in the corpus register/);
  });

  it('admits a source the register marked in', () => {
    const source = admit('taper-meta-analysis-2023');
    expect(source.licence).toBe('CC BY 4.0');
    expect(source.pmcid).toBe('PMC10171681');
  });

  it('has no duplicate slugs', () => {
    const slugs = CORPUS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
