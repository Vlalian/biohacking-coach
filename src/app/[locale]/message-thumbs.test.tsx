// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * `garmin-connect-api/08`: a rating is stored only with the "Help improve the
 * product" consent. A refused rating rolls the thumb back, as every refused
 * write already does, and says why with a link to Privacy & consent.
 */
const { rateMessageAction, clearMessageRatingAction } = vi.hoisted(() => ({
  rateMessageAction: vi.fn(),
  clearMessageRatingAction: vi.fn(),
}));
vi.mock('./message-feedback-actions', () => ({ rateMessageAction, clearMessageRatingAction }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const { MessageThumbs } = await import('./message-thumbs');

const LABELS = {
  up: 'This helped',
  down: 'This missed',
  commentPlaceholder: 'Anything to add?',
  save: 'Save',
  consentRequired: 'Ratings are only saved with consent.',
  consentRequiredLink: 'Open Privacy & consent',
};

beforeEach(() => {
  rateMessageAction.mockReset();
  clearMessageRatingAction.mockReset();
});
afterEach(cleanup);

describe('MessageThumbs without the product-improvement consent', () => {
  it('rolls the thumb back, says why and links to Privacy & consent', async () => {
    rateMessageAction.mockResolvedValue({ ok: false, reason: 'consent-required' });
    render(<MessageThumbs messageId="m1" initial={null} labels={LABELS} />);

    fireEvent.click(screen.getByRole('button', { name: LABELS.up }));

    const link = await screen.findByRole('link', { name: LABELS.consentRequiredLink });
    expect(link.getAttribute('href')).toBe('/privacy');
    expect(screen.getByText(LABELS.consentRequired, { exact: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: LABELS.up }).getAttribute('aria-pressed')).toBe('false');
  });

  it('says nothing about consent when a rating is refused for another reason', async () => {
    rateMessageAction.mockResolvedValue({ ok: false, reason: 'not-flaggable' });
    render(<MessageThumbs messageId="m1" initial={null} labels={LABELS} />);

    fireEvent.click(screen.getByRole('button', { name: LABELS.up }));

    await vi.waitFor(() => expect(screen.getByRole('button', { name: LABELS.up }).getAttribute('aria-pressed')).toBe('false'));
    expect(screen.queryByRole('link', { name: LABELS.consentRequiredLink })).toBeNull();
  });
});
