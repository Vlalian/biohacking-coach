// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { disclosureCopy } from '@/features/consent/disclosure';

/**
 * `garmin-connect-api/08`: feedback is stored only with the "Help improve the
 * product" consent. Without it the form says why, shows what that consent
 * covers, and lets the athlete allow it and send the same draft without
 * leaving the form (CodeRabbit, PR #130). Real catalogue, so the words
 * are the ones a tester reads.
 */
const { submitFeedbackAction, grantConsentsAction } = vi.hoisted(() => ({
  submitFeedbackAction: vi.fn(),
  grantConsentsAction: vi.fn(),
}));
vi.mock('./feedback-actions', () => ({ submitFeedbackAction }));
vi.mock('./consent-actions', () => ({ grantConsentsAction }));

const { FeedbackForm } = await import('./feedback-form');

afterEach(cleanup);
beforeEach(() => {
  submitFeedbackAction.mockReset();
  grantConsentsAction.mockReset().mockResolvedValue({ ok: true });
});

const PURPOSE = disclosureCopy('en').purposes.product_improvement;

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
  it('says why and shows what the consent covers, in the disclosure’s own words, keeping the draft', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: false, reason: 'consent-required' });
    send();

    expect(await screen.findByText(en.Feedback.consentRequired, { exact: false })).toBeTruthy();
    expect(screen.getByText(PURPOSE.body)).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('the calendar jumped');
    expect(screen.queryByText(en.Feedback.error)).toBeNull();
  });

  it('allowing it grants the consent and sends the same draft, without leaving the form (CodeRabbit, PR #130)', async () => {
    submitFeedbackAction
      .mockResolvedValueOnce({ ok: false, reason: 'consent-required' })
      .mockResolvedValueOnce({ ok: true });
    send();

    const allow = (await screen.findByRole('button', { name: en.Feedback.consentAllowAndSend })) as HTMLButtonElement;
    await vi.waitFor(() => expect(allow.disabled).toBe(false));
    fireEvent.click(allow);

    expect(await screen.findByText(en.Feedback.sent)).toBeTruthy();
    expect(grantConsentsAction).toHaveBeenCalledWith(['product_improvement']);
    expect(submitFeedbackAction.mock.calls[1]).toEqual(submitFeedbackAction.mock.calls[0]);
    expect(grantConsentsAction.mock.invocationCallOrder[0]).toBeLessThan(submitFeedbackAction.mock.invocationCallOrder[1]);
  });

  it('keeps the generic error for any other failure', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: false, reason: 'too-long' });
    send();

    expect(await screen.findByText(en.Feedback.error)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.Feedback.consentAllowAndSend })).toBeNull();
  });
});
