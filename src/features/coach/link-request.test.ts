import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `training-architecture/14`: what the athlete is asked about their Coaching
 * Link, if anything. A pending link asks for the Head-Coach-visibility consent
 * before the coach sees anything; an active link whose consent went stale with
 * a disclosure change asks again while the link stays active (Mads,
 * 2026-11-01). The repository and the consent gate are the boundaries.
 */
const { getPendingLinkForAthlete, getLinkForAthlete, hasConsent } = vi.hoisted(() => ({
  getPendingLinkForAthlete: vi.fn(),
  getLinkForAthlete: vi.fn(),
  hasConsent: vi.fn(),
}));
vi.mock('./coach-repository', () => ({ getPendingLinkForAthlete, getLinkForAthlete }));
vi.mock('@/features/consent/consent-gate', () => ({ hasConsent }));

const { getLinkRequestForAthlete } = await import('./link-request');

const ACTIVE = {
  headCoachName: 'Lars Berg',
  headCoachPreferredName: 'Lars',
  link: { id: 'l2', coachId: 'c1', athleteId: 'a1', status: 'active', visibility: { shareAthleteReports: true, shareAiTranscripts: false } },
};

beforeEach(() => {
  vi.resetAllMocks();
  getPendingLinkForAthlete.mockResolvedValue(undefined);
  getLinkForAthlete.mockResolvedValue(undefined);
  hasConsent.mockResolvedValue(true);
});

describe('getLinkRequestForAthlete', () => {
  it('asks about a pending link first', async () => {
    getPendingLinkForAthlete.mockResolvedValue({ linkId: 'l1', coachName: 'Lars' });

    expect(await getLinkRequestForAthlete('a1')).toEqual({ kind: 'pending', linkId: 'l1', coachName: 'Lars' });
  });

  it('asks again about an active link whose coach consent is not current, naming the coach as they chose', async () => {
    getLinkForAthlete.mockResolvedValue(ACTIVE);
    hasConsent.mockResolvedValue(false);

    expect(await getLinkRequestForAthlete('a1')).toEqual({ kind: 'reconsent', linkId: 'l2', coachName: 'Lars' });
    expect(hasConsent).toHaveBeenCalledWith('a1', 'head_coach_visibility');
  });

  it('falls back to the coach’s account name when they chose none', async () => {
    getLinkForAthlete.mockResolvedValue({ ...ACTIVE, headCoachPreferredName: null });
    hasConsent.mockResolvedValue(false);

    expect((await getLinkRequestForAthlete('a1'))?.coachName).toBe('Lars Berg');
  });

  it('asks nothing with a current consent, or with no link at all', async () => {
    getLinkForAthlete.mockResolvedValue(ACTIVE);
    expect(await getLinkRequestForAthlete('a1')).toBeUndefined();

    getLinkForAthlete.mockResolvedValue(undefined);
    hasConsent.mockResolvedValue(false);
    expect(await getLinkRequestForAthlete('a1')).toBeUndefined();
  });
});
