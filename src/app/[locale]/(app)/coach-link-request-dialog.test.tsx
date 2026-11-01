// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { disclosureCopy } from '@/features/consent/disclosure';

/**
 * `training-architecture/14`: a pending Coaching Link asks the athlete, by the
 * coach's name, for the Head-Coach-visibility consent before the coach sees
 * anything. Accepting grants it and activates the link; declining severs it.
 */
const { acceptCoachingLinkAction, declineCoachingLinkAction, grantConsentsAction, withdrawConsentAction, refresh } = vi.hoisted(() => ({
  acceptCoachingLinkAction: vi.fn(),
  declineCoachingLinkAction: vi.fn(),
  grantConsentsAction: vi.fn(),
  withdrawConsentAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(',')})` : key,
  useLocale: () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/use-dialog-focus', () => ({ useDialogFocus: () => ({ current: null }) }));
vi.mock('../coaching-link-actions', () => ({ acceptCoachingLinkAction, declineCoachingLinkAction }));
vi.mock('../consent-actions', () => ({ grantConsentsAction, withdrawConsentAction }));

const { CoachLinkRequestDialog } = await import('./coach-link-request-dialog');

const COPY = disclosureCopy('en').purposes.head_coach_visibility;

beforeEach(() => {
  acceptCoachingLinkAction.mockReset().mockResolvedValue({ ok: true });
  declineCoachingLinkAction.mockReset().mockResolvedValue({ ok: true });
  grantConsentsAction.mockReset().mockResolvedValue({ ok: true });
  withdrawConsentAction.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});
afterEach(cleanup);

describe('CoachLinkRequestDialog', () => {
  it('names the coach and shows what the consent covers, in the disclosure’s own words', () => {
    render(<CoachLinkRequestDialog request={{ kind: 'pending', linkId: 'l1', coachName: 'Lars' }} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('title(Lars)')).toBeTruthy();
    expect(screen.getByText(COPY.title)).toBeTruthy();
    expect(screen.getByText(COPY.body)).toBeTruthy();
  });

  it('accepting answers for this link and refreshes the page', async () => {
    render(<CoachLinkRequestDialog request={{ kind: 'pending', linkId: 'l1', coachName: 'Lars' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'accept' }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(acceptCoachingLinkAction).toHaveBeenCalledWith('l1');
    expect(declineCoachingLinkAction).not.toHaveBeenCalled();
  });

  it('declining answers for this link and refreshes the page', async () => {
    render(<CoachLinkRequestDialog request={{ kind: 'pending', linkId: 'l1', coachName: 'Lars' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'decline' }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(declineCoachingLinkAction).toHaveBeenCalledWith('l1');
    expect(acceptCoachingLinkAction).not.toHaveBeenCalled();
  });

  it('says so and stays open when the answer did not land', async () => {
    acceptCoachingLinkAction.mockResolvedValue({ ok: false, reason: 'not-pending' });
    render(<CoachLinkRequestDialog request={{ kind: 'pending', linkId: 'l1', coachName: 'Lars' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'accept' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('CoachLinkRequestDialog — asking again after the consent text changed (Mads, 2026-11-01)', () => {
  const STALE = { kind: 'reconsent', linkId: 'l2', coachName: 'Lars' } as const;

  it('says the coach already follows the athlete, and shows the current consent words', () => {
    render(<CoachLinkRequestDialog request={STALE} />);

    expect(screen.getByText('reconsentTitle(Lars)')).toBeTruthy();
    expect(screen.getByText('reconsentIntro')).toBeTruthy();
    expect(screen.getByText(COPY.body)).toBeTruthy();
  });

  it('keeping it grants the consent again, and touches the link through nothing else', async () => {
    render(<CoachLinkRequestDialog request={STALE} />);

    fireEvent.click(screen.getByRole('button', { name: 'reconsentKeep' }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(grantConsentsAction).toHaveBeenCalledWith(['head_coach_visibility']);
    expect(acceptCoachingLinkAction).not.toHaveBeenCalled();
  });

  it('stopping withdraws the consent, which pauses the link', async () => {
    render(<CoachLinkRequestDialog request={STALE} />);

    fireEvent.click(screen.getByRole('button', { name: 'reconsentStop' }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(withdrawConsentAction).toHaveBeenCalledWith('head_coach_visibility');
    expect(declineCoachingLinkAction).not.toHaveBeenCalled();
  });
});
