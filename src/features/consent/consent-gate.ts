import { getActiveConsents } from './consent-repository';
import { missingRequiredConsents } from './consent';
import type { ConsentPurpose } from './disclosure';

/**
 * The server-enforced consent gate.
 *
 * This is the control the whole slice turns on: the AI Coach must not process an
 * athlete's data unless a valid, current-version consent exists for every
 * required purpose. It is enforced on the server, before any data is assembled
 * into a prompt — not asked of the model in a system prompt, which would be no
 * control at all (the lesson of gdpr-decisions decision 1).
 *
 * The decision is pure ({@link missingRequiredConsents}); this function only
 * reads the athlete's active consents and applies it. Callers pass the athlete
 * id resolved from the authenticated session (ADR 0006), never from the request
 * body.
 */

export type ConsentGateResult =
  | { ok: true }
  | { ok: false; missing: ConsentPurpose[] };

/**
 * Refuses AI coaching unless every required purpose is consented under the
 * current disclosure version. Returns the missing purposes on refusal so a
 * caller can say precisely what is needed.
 */
export async function assertAiCoachingConsent(
  athleteId: string,
): Promise<ConsentGateResult> {
  const active = await getActiveConsents(athleteId);
  const missing = missingRequiredConsents(active);
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
