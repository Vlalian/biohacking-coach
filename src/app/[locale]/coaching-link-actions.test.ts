import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `training-architecture/14`: a Coaching Link starts pending and becomes active
 * only when the athlete grants the Head-Coach-visibility consent. The athlete
 * is resolved from the session, never the payload (ADR 0006); the link id is
 * client-supplied, which is why the repository moves only the athlete's own.
 */
const { resolveAthleteId, grantConsent, activatePendingLink, declinePendingLink, revalidatePath } = vi.hoisted(() => ({
  resolveAthleteId: vi.fn(),
  grantConsent: vi.fn(),
  activatePendingLink: vi.fn(),
  declinePendingLink: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/consent/consent-repository', () => ({ grantConsent }));
vi.mock('@/features/coach/coach-repository', () => ({ activatePendingLink, declinePendingLink }));

const { acceptCoachingLinkAction, declineCoachingLinkAction } = await import('./coaching-link-actions');

beforeEach(() => {
  vi.resetAllMocks();
  resolveAthleteId.mockResolvedValue('athlete_1');
  activatePendingLink.mockResolvedValue(true);
  declinePendingLink.mockResolvedValue(true);
});

describe('acceptCoachingLinkAction', () => {
  it('grants the coach consent first, then activates the link', async () => {
    expect(await acceptCoachingLinkAction('l1')).toEqual({ ok: true });

    expect(grantConsent).toHaveBeenCalledWith('athlete_1', 'head_coach_visibility');
    expect(activatePendingLink).toHaveBeenCalledWith('athlete_1', 'l1');
    expect(grantConsent.mock.invocationCallOrder[0]).toBeLessThan(activatePendingLink.mock.invocationCallOrder[0]);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('says so when there was no pending link of theirs to accept', async () => {
    activatePendingLink.mockResolvedValue(false);

    expect(await acceptCoachingLinkAction('l1')).toEqual({ ok: false, reason: 'not-pending' });
  });

  it('refuses a signed-out caller and touches nothing', async () => {
    resolveAthleteId.mockResolvedValue(null);

    expect(await acceptCoachingLinkAction('l1')).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(grantConsent).not.toHaveBeenCalled();
    expect(activatePendingLink).not.toHaveBeenCalled();
  });
});

describe('declineCoachingLinkAction', () => {
  it('severs the pending link and grants nothing', async () => {
    expect(await declineCoachingLinkAction('l1')).toEqual({ ok: true });

    expect(declinePendingLink).toHaveBeenCalledWith('athlete_1', 'l1');
    expect(grantConsent).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('says so when there was nothing pending, and refuses a signed-out caller', async () => {
    declinePendingLink.mockResolvedValue(false);
    expect(await declineCoachingLinkAction('l1')).toEqual({ ok: false, reason: 'not-pending' });

    resolveAthleteId.mockResolvedValue(null);
    expect(await declineCoachingLinkAction('l1')).toEqual({ ok: false, reason: 'not-authenticated' });
  });
});
