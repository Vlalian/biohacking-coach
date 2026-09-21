import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Citation } from '@/lib/citation';

const { CitationList, CitationEntries, citationSummary } = await import('./citation-list');

const CITES: Citation[] = [
  { sourceId: 's1', slug: 'seiler', title: 'Seiler 2010', authors: 'Seiler', year: 2010, url: 'https://x/1', licence: 'CC BY', licenceUrl: '', attribution: 'Seiler (2010)', ordinals: [1] },
  { sourceId: 's2', slug: 'b', title: 'Second paper', authors: 'B', year: 2020, url: null, licence: 'CC BY', licenceUrl: '', attribution: 'B (2020)', ordinals: [2] },
];

/** The references under a reply are collapsed to one line (showable-version/26, Mads 2026-09-17). */
describe('CitationList', () => {
  it('citationSummary is the heading and the count', () => {
    expect(citationSummary('What I drew on', 3)).toBe('What I drew on · 3');
  });

  it('renders one collapsed line with the count and no titles, as a toggle', () => {
    // The list had become the largest thing on screen (Mads, production).
    const html = renderToStaticMarkup(<CitationList citations={CITES} heading="What I drew on" />);
    expect(html).toContain('What I drew on · 2');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-citations-toggle');
    expect(html).not.toContain('Seiler 2010');
    expect(html).not.toContain('<ul');
  });

  it('the entries keep today’s markup: linked title or plain title, then the attribution', () => {
    const html = renderToStaticMarkup(<CitationEntries citations={CITES} />);
    expect(html).toMatch(/<a[^>]*href="https:\/\/x\/1"[^>]*>Seiler 2010<\/a>/);
    expect(html).toContain('<span>Second paper</span>');
    expect(html).toContain('· Seiler (2010)');
    expect(html).toContain('· B (2020)');
  });

  it('renders nothing at all with no citations, as before', () => {
    // Green on the old component too — kept as the regression guard for the new state.
    expect(renderToStaticMarkup(<CitationList citations={[]} heading="What I drew on" />)).toBe('');
  });
});
