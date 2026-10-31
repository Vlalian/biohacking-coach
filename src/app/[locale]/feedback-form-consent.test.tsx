// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/messages/en.json';

/**
 * `garmin-connect-api/08`: feedback is stored only with the "Help improve the
 * product" consent. Without it the form says why and links to Privacy &
 * consent, rather than showing the generic error. Real catalogue, so the words
 * are the ones a tester reads.
 */
const { submitFeedbackAction } = vi.hoisted(() => ({ submitFeedbackAction: vi.fn() }));
vi.mock('./feedback-actions', () => ({ submitFeedbackAction }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const { FeedbackForm } = await import('./feedback-form');

afterEach(cleanup);

function send() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FeedbackForm openedFrom="/training-plan" />
    </NextIntlClientProvider>,
  );
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'the calendar jumped' } });
  fireEvent.click(screen.getByRole('button', { name: en.Feedback.send }));
}

describe('FeedbackForm without the product-improvement consent', () => {
  it('says why and links to Privacy & consent', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: false, reason: 'consent-required' });
    send();

    expect(await screen.findByText(en.Feedback.consentRequired, { exact: false })).toBeTruthy();
    const link = screen.getByRole('link', { name: en.Feedback.consentRequiredLink });
    expect(link.getAttribute('href')).toBe('/privacy');
    expect(screen.queryByText(en.Feedback.error)).toBeNull();
  });

  it('keeps the generic error for any other failure', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: false, reason: 'too-long' });
    send();

    expect(await screen.findByText(en.Feedback.error)).toBeTruthy();
    expect(screen.queryByRole('link', { name: en.Feedback.consentRequiredLink })).toBeNull();
  });
});
