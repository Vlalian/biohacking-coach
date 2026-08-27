import { describe, it, expect } from 'vitest';
import { extractArticleText } from './jats';

/**
 * A JATS article in miniature.
 *
 * Invented, not copied from the corpus — it only has to exercise the shapes the
 * extractor has to survive: mixed inline markup inside a paragraph, a citation
 * marker to drop, a table and a figure caption that read like prose but are not,
 * and a reference list in `<back>` that must not reach a chunk.
 */
const ARTICLE = `<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink">
  <front>
    <article-meta>
      <title-group>
        <article-title>Effects of tapering on endurance performance</article-title>
      </title-group>
      <abstract>
        <p>A two-week taper produced the largest gain.</p>
      </abstract>
    </article-meta>
  </front>
  <body>
    <sec>
      <label>1</label>
      <title>Introduction</title>
      <p>Rates of <italic>up to</italic> 90 g per hour were tolerated<xref ref-type="bibr" rid="B1">[1]</xref>.</p>
      <p>Volume fell by 41&#x00025; while intensity was maintained.</p>
    </sec>
    <sec>
      <title>Methods</title>
      <table-wrap>
        <caption><p>Table 1. Participant characteristics.</p></caption>
        <table><tbody><tr><td>Mean age 34 years</td></tr></tbody></table>
      </table-wrap>
      <fig>
        <caption><p>Figure 1. Forest plot of pooled effects.</p></caption>
        <graphic xlink:href="fig1.jpg"/>
      </fig>
      <p>Twelve trials met the inclusion criteria.</p>
    </sec>
  </body>
  <back>
    <ref-list>
      <title>References</title>
      <ref id="B1"><mixed-citation>Mujika I. Tapering and peaking. 2009.</mixed-citation></ref>
    </ref-list>
  </back>
</article>`;

describe('extractArticleText', () => {
  const text = extractArticleText(ARTICLE);

  it('returns the abstract and the body prose', () => {
    expect(text).toContain('A two-week taper produced the largest gain.');
    expect(text).toContain('Twelve trials met the inclusion criteria.');
  });

  it('keeps inline markup inside the sentence it belongs to', () => {
    // The failure this guards is a parser that discards ordering and yields
    // "Rates of  90 g per hour were tolerated" with the italic text elsewhere.
    expect(text).toContain('Rates of up to 90 g per hour were tolerated');
  });

  it('drops the reference list', () => {
    // A reference list is the best available way to poison a vector search: it
    // is dense, generic, and similar to every other reference list.
    expect(text).not.toContain('Mujika');
    expect(text).not.toContain('Tapering and peaking');
    expect(text).not.toContain('References');
  });

  it('drops citation markers, tables, and figure captions', () => {
    expect(text).not.toContain('[1]');
    expect(text).not.toContain('Mean age 34 years');
    expect(text).not.toContain('Forest plot');
  });

  it('decodes entities rather than embedding them literally', () => {
    expect(text).toContain('41%');
    expect(text).not.toContain('&#x00025;');
  });

  it('separates blocks so sentences do not run together', () => {
    expect(text).toContain('\n\n');
    // Section titles survive as their own block — they carry the topic word a
    // retrieval query often matches on.
    expect(text).toContain('Introduction');
  });

  it('returns an empty string for XML that is not a JATS article', () => {
    // This case used to assert `'nope'` — under a test named for the opposite.
    // `body` is not a JATS-only tag, so an HTML page satisfied the old search
    // and its prose came back as article text. PMC serves HTML for a withdrawn
    // or mistyped id, so the failure was reachable from a typo in the register,
    // and the fetch path would have cached the result as a good fetch.
    expect(extractArticleText('<html><body><p>nope</p></body></html>')).toBe('');
    expect(extractArticleText('<gpx><trk/></gpx>')).toBe('');
    expect(extractArticleText('not xml at all <<<')).toBe('');
  });

  it('reads only the article, ignoring a body outside it', () => {
    // Belt to the braces above: a wrapper document carrying both must yield the
    // article's text and nothing else, rather than concatenating whatever `body`
    // it happened to reach first.
    const xml =
      '<wrapper><body><p>not the paper</p></body>' +
      '<article><body><p>the paper</p></body></article></wrapper>';

    const text = extractArticleText(xml);

    expect(text).toContain('the paper');
    expect(text).not.toContain('not the paper');
  });
});
