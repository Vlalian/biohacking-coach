import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { FeedbackInterview } from './feedback-interview';

// Framework and server boundaries: next-intl's navigation needs Next's router,
// and the server actions reach the database. A static render calls neither.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('./feedback-actions', () => ({
  sendFeedbackTurnAction: vi.fn(),
  submitFallbackFeedbackAction: vi.fn(),
}));

/**
 * `showable-version/58` — one way to give feedback.
 *
 * The interview is the way in. The plain box is what is left when the
 * interviewer cannot answer, so it is on the page only after a failure, and it
 * carries the failure's tag. Rendered against the real catalogue, as
 * `glossary-view.test.tsx` does, so the copy is the copy the tester reads.
 */
function renderInterview(props: { initialNotice: 'none' | 'error' | 'consentRequired' }) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Europe/Copenhagen">
      <FeedbackInterview initial={null} openedFrom={null} initialNotice={props.initialNotice} />
    </NextIntlClientProvider>,
  );
}

describe('FeedbackInterview — the box is the fallback, not a second way in', () => {
  it('shows no comment box while the interviewer is working', () => {
    const html = renderInterview({ initialNotice: 'none' });
    expect(html).not.toContain('data-fallback');
    expect(html).not.toContain('id="feedback-fallback"');
    // The interview itself is there.
    expect(html).toContain('id="feedback-interview-message"');
  });

  it('shows the comment box, tagged, when the interviewer failed', () => {
    const html = renderInterview({ initialNotice: 'error' });
    expect(html).toContain('data-fallback="coach-unavailable"');
    expect(html).toContain('id="feedback-fallback"');
    expect(html).toContain(en.FeedbackInterview.fallbackTitle);
  });

  it('shows the comment box, tagged, when the interview needs consent the tester has not given', () => {
    const html = renderInterview({ initialNotice: 'consentRequired' });
    expect(html).toContain('data-fallback="consent-required"');
  });
});
