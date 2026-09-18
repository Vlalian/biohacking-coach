import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import da from '@/messages/da.json';
import { GlossaryView } from './glossary-view';

/**
 * `eval-mvp-build/16` — the Glossary View.
 *
 * Rendered against the *real* catalogues rather than a key-echoing mock: the
 * criterion is that the POC's copy arrived in both languages through next-intl,
 * and a mock that returns its own key would pass with an empty catalogue.
 */
function render(locale: 'en' | 'da') {
  const messages = locale === 'en' ? en : da;
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <GlossaryView />
    </NextIntlClientProvider>,
  );
}

describe('GlossaryView', () => {
  it('renders the three sections as collapsible groups', () => {
    const html = render('en');
    expect(html.match(/<details\b/g)?.length).toBe(3);
    expect(html.match(/<summary\b/g)?.length).toBe(3);
  });

  it('opens the first section and leaves the other two folded, as the POC did', () => {
    const html = render('en');
    const details = html.match(/<details[^>]*>/g) ?? [];
    expect(details[0]).toMatch(/\bopen\b/);
    expect(details[1]).not.toMatch(/\bopen\b/);
    expect(details[2]).not.toMatch(/\bopen\b/);
  });

  it('heads each section with its English title', () => {
    const html = render('en');
    expect(html).toContain('Training Concepts');
    expect(html).toContain('Session Types');
    expect(html).toContain('Race Terms');
  });

  it('heads each section with its Danish title', () => {
    const html = render('da');
    expect(html).toContain('Træningsbegreber');
    expect(html).toContain('Sessionstyper');
    expect(html).toContain('Løbstermer');
    expect(html).not.toContain('Training Concepts');
  });

  it('ports every POC term as a term-and-definition pair, in both languages', () => {
    // 8 training concepts, 7 session types, 7 race terms in the POC.
    for (const locale of ['en', 'da'] as const) {
      const html = render(locale);
      expect(html.match(/<dt\b/g)?.length, locale).toBe(22);
      expect(html.match(/<dd\b/g)?.length, locale).toBe(22);
    }
    expect(render('en')).toContain('Lactate threshold');
    expect(render('da')).toContain('Laktatgrænse');
    expect(render('en')).toContain('Brick session');
    expect(render('da')).toContain('Brick-session');
    expect(render('en')).toContain('Wetsuit legal');
    expect(render('da')).toContain('Våddragt tilladt');
  });
});

describe('every string on the page comes from the catalogues', () => {
  // Resolved from this file, never from `process.cwd()`: the mutation gate runs
  // the suite from a sandbox copy with a different working directory.
  const source = (name: string) =>
    readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/\/\/.*/g, ' ');

  it.each(['./glossary-view.tsx', './page.tsx'])('%s carries no literal copy', (file) => {
    const code = source(file);
    // JSX text: any run between tags that is not an expression.
    expect(code).not.toMatch(/>\s*[A-Za-zÆØÅæøå][^<{]*</);
    // A string literal that reads as a sentence — ends in a full stop.
    expect(code).not.toMatch(/['"`][^'"`\n]*[A-Za-z]{2,}\.['"`]/);
  });
});
