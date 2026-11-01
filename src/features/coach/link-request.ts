import { hasConsent } from '@/features/consent/consent-gate';
import { getLinkForAthlete, getPendingLinkForAthlete } from './coach-repository';

/**
 * What the athlete is asked about their Coaching Link, if anything
 * (`training-architecture/14`).
 *
 * - **pending**: a new link waits for the Head-Coach-visibility consent; the
 *   coach sees nothing until the athlete says yes.
 * - **reconsent**: an active link whose consent is no longer current, because
 *   the disclosure's wording changed since it was given. The link stays active
 *   and the athlete is asked again (Mads, 2026-11-01); saying no withdraws the
 *   consent, which pauses the link like any withdrawal.
 */
export type LinkRequest = { kind: 'pending' | 'reconsent'; linkId: string; coachName: string };

export async function getLinkRequestForAthlete(athleteId: string): Promise<LinkRequest | undefined> {
  const pending = await getPendingLinkForAthlete(athleteId);
  if (pending) return { kind: 'pending', ...pending };

  const active = await getLinkForAthlete(athleteId);
  if (!active || (await hasConsent(athleteId, 'head_coach_visibility'))) return undefined;
  return {
    kind: 'reconsent',
    linkId: active.link.id,
    coachName: active.headCoachPreferredName ?? active.headCoachName,
  };
}
