'use server';

import { submittedFromView } from '@/features/feedback/feedback';
import { recordFeedback } from '@/features/feedback/feedback-repository';
import { resolveAthleteId } from './current-actor';

/**
 * The feedback page's one server action (`showable-version/58`).
 *
 * No model call and no consent gate. The escape hatch never depends on the API
 * or on a gate: a tester whose Coach is broken, or who has withdrawn consent and
 * is complaining about what that did, is the tester with the most to say.
 *
 * Not gated on the optional `product_improvement` consent purpose either.
 * Decided 2026-09-01 with Mads: gating an escape hatch on an optional purpose
 * silences exactly the people it exists for, and testers are told about this in
 * the invite email (decision 8, 2026-08-18).
 *
 * Deliberately no `revalidatePath`: it changes no server-rendered View.
 */

export type FeedbackResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'not-authenticated' };

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

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  await recordFeedback({ athleteId, body, view: submittedFromView(input.view) });
  return { ok: true };
}
