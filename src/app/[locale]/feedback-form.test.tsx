import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import da from '@/messages/da.json';

// The form posts through a server action, whose import chain ends at the
// database. No first render calls it.
vi.mock('./feedback-actions', () => ({ submitFeedbackAction: vi.fn() }));

const { FeedbackForm } = await import('./feedback-form');

/**
 * `showable-version/58` (Mads, 2026-09-30): one way to give feedback, and it is
 * a plain comment field with guidance above it on how much to write. Rendered
 * against the real catalogues, because the guidance *is* the feature: a
 * key-echoing mock would pass with an empty catalogue.
 */
function render(locale: 'en' | 'da') {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : da}>
      <FeedbackForm openedFrom="/training-plan" />
    </NextIntlClientProvider>,
  );
}

/** The markup with tags removed, so assertions read the words a tester reads. */
function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('FeedbackForm', () => {
  it('offers exactly one box to write in, and one button', () => {
    const html = render('en');

    expect(html.match(/<textarea\b/g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(1);
  });

  it('tells the tester, above the box, what to include and how much', () => {
    const html = render('en');
    const guidance = text(html.slice(0, html.indexOf('<textarea')));

    expect(guidance).toContain('What happened');
    expect(guidance).toContain('Where in the app: which screen, session or message');
    expect(guidance).toContain('What you expected instead');
    expect(guidance).toContain('A couple of sentences is plenty');
  });

  it('gives the same guidance in Danish', () => {
    const html = render('da');
    const guidance = text(html.slice(0, html.indexOf('<textarea')));

    expect(guidance).toContain('Hvad der skete');
    expect(guidance).toContain('Hvor i appen: hvilken skærm, hvilket træningspas eller hvilken besked');
    expect(guidance).toContain('Hvad du havde forventet i stedet');
    expect(guidance).toContain('Et par sætninger er rigeligt');
  });

  it('labels the box for a screen reader', () => {
    const html = render('en');
    const id = html.match(/<textarea[^>]*id="([^"]+)"/)?.[1];

    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>Your feedback</label>`));
  });

  it('is not a conversation and asks no Trust Signal question', () => {
    // The AI interviewer is gone (ADR 0009, amended 2026-09-30), and the Trust
    // Signal is dropped until it gets its own surface.
    for (const locale of ['en', 'da'] as const) {
      const words = text(render(locale)).toLowerCase();

      expect(words).not.toContain('interview');
      expect(words).not.toMatch(/decided alone|besluttet alene/);
    }
  });
});
