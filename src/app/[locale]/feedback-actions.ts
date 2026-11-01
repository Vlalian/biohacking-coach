'use server';

import { FEEDBACK_MAX_LENGTH, submittedFromView } from '@/features/feedback/feedback';
import { recordFeedback } from '@/features/feedback/feedback-repository';
import { hasConsent } from '@/features/consent/consent-gate';
import { resolveAthleteId } from './current-actor';

/**
 * The feedback page's one server action (`showable-version/58`).
 *
 * No model call, and no AI-consent gate: a tester whose Coach is broken, or who
 * has withdrawn AI consent, can still write.
 *
 * **Gated on the optional `product_improvement` purpose** (garmin-connect-api/08).
 * On 2026-09-01 Mads decided against this gate: gating an escape hatch on an
 * optional purpose silences exactly the people it exists for. He reversed it
 * on 2026-10-31 while settling the Privacy Policy's legal bases ("Keep the
 * gate"): feedback is used to improve the product, so it rests on that consent
 * rather than on legitimate interest. Without it the action stores nothing and
 * says why, and the form links to Privacy & consent.
 *
 * Deliberately no `revalidatePath`: it changes no server-rendered View.
 */

export type FeedbackResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'too-long' | 'not-authenticated' | 'consent-required' };

export async function submitFeedbackAction(input: {
  body: string;
  /**
   * The View the tester came from, for context when someone reads this later —
   * carried by the escape hatch's own link, since the feedback page cannot
   * observe where the tester was. Narrowed on arrival.
   */
  view: string | null;
}): Promise<FeedbackResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, reason: 'empty' };
  if (body.length > FEEDBACK_MAX_LENGTH) return { ok: false, reason: 'too-long' };

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };
  if (!(await hasConsent(athleteId, 'product_improvement'))) return { ok: false, reason: 'consent-required' };

  await recordFeedback({ athleteId, body, view: submittedFromView(input.view) });
  return { ok: true };
}
