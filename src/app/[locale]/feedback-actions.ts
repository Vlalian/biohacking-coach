'use server';

import { assertAiCoachingConsent } from '@/features/consent/consent-gate';
import { knownFailureReason, submittedFromView } from '@/features/feedback/feedback';
import { recordFallback } from '@/features/feedback/feedback-repository';
import {
  sendFeedbackTurn,
  type SendFeedbackResult,
} from '@/features/feedback/feedback-service';
import { resolveAthleteId, resolveAthleteWithLanguage, type AuthFailure } from './current-actor';

/**
 * Server actions for the Feedback Interview (`showable-version/07`).
 *
 * Two entry points with deliberately different guarantees, and the difference is
 * the whole design:
 *
 * - {@link sendFeedbackTurnAction} talks to a model with the tester's free text,
 *   so it runs the AI consent gate exactly as `chat-actions.ts` does.
 * - {@link submitFallbackFeedbackAction} does not, and must not. The escape
 *   hatch can never hard-depend on the API or on a gate: a tester whose Coach is
 *   broken — or who has withdrawn consent and is complaining about what that
 *   did — is the tester with the most to say.
 *
 * Neither is gated on the optional `product_improvement` consent purpose.
 * Decided 2026-09-01 with Mads: gating an escape hatch on an optional purpose
 * silences exactly the people it exists for, and testers are told about this in
 * the invite email (decision 8, 2026-08-18).
 *
 * Deliberately no `revalidatePath`: neither changes a server-rendered View.
 */

type ConsentFailure = { ok: false; reason: 'consent-required' };

export async function sendFeedbackTurnAction(input: {
  conversationId: string | null;
  content: string;
}): Promise<SendFeedbackResult | AuthFailure | ConsentFailure> {
  const resolved = await resolveAthleteWithLanguage();
  if (!resolved.ok) return resolved;

  const gate = await assertAiCoachingConsent(resolved.athlete.id);
  if (!gate.ok) return { ok: false, reason: 'consent-required' };

  return sendFeedbackTurn(
    resolved.athlete.id,
    input.conversationId,
    input.content,
    resolved.language,
  );
}

export type FallbackResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'not-authenticated' };

export async function submitFallbackFeedbackAction(input: {
  body: string;
  /**
   * The View the tester came from, for context when someone reads this later —
   * carried by the escape hatch's own link, since the interview is its own page
   * and cannot observe where the tester was. Narrowed on arrival.
   */
  view: string | null;
  coachFailureReason: string | null;
}): Promise<FallbackResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, reason: 'empty' };

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  await recordFallback({
    athleteId,
    body,
    view: submittedFromView(input.view),
    coachFailureReason: knownFailureReason(input.coachFailureReason),
  });
  return { ok: true };
}
