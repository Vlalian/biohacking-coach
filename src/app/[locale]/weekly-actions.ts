'use server';

import { revalidatePath } from 'next/cache';
import { assertAiCoachingConsent } from '@/features/consent/consent-gate';
import { saveCheckIn } from '@/features/coach/check-in-repository';
import { dateKey, weekStartOf } from '@/lib/date';
import {
  resolveAthleteWithLanguage as currentAthlete,
  type AuthFailure,
} from './current-actor';
import {
  commitWeeklyPlan,
  continueWeeklySession,
  declineWeeklyPlan,
  startWeeklySession,
  type CommitResult,
  type ContinueResult,
  type DeclineResult,
  type StartWeeklySessionResult,
} from '@/features/coach/weekly-session-service';

/**
 * Server actions for the Weekly Session.
 *
 * The athlete is resolved here from the authenticated session — the client sends
 * only a conversation id and message text, never who they are. The service then
 * checks any client-supplied conversation id against that owner (ADR 0006), so
 * these actions add authentication and the service adds authority.
 *
 * The two actions that make the Coach process the athlete's data — starting a
 * Weekly Session and sending it a message — also pass the server-enforced
 * consent gate before any prompt is assembled: no valid, current-version consent
 * for the required purposes, no AI call (gdpr-decisions item A). The gate is the
 * control; the consent screen is only its front door.
 *
 * The Coach's language is read here too — from the user's `ui_prefs` (ticket 09),
 * through the user seam, and passed into the service as plain data.
 */

type ConsentFailure = { ok: false; reason: 'consent-required' };

/**
 * The server-enforced gate on AI processing: refuses unless the athlete's
 * required consents are current. Returns a `consent-required` failure the action
 * surfaces, rather than ever reaching the Coach with un-consented data. In the
 * normal flow the render gate has already collected consent, so this fires only
 * for a request that skipped it — which is exactly what a control is for.
 */
async function aiConsentOk(athleteId: string): Promise<boolean> {
  const gate = await assertAiCoachingConsent(athleteId);
  return gate.ok;
}

export type CheckInResult = { ok: true } | AuthFailure | { ok: false; reason: 'invalid' };

/**
 * Files the athlete's Check-in for this week.
 *
 * Deliberately **not** gated on AI consent: nothing is sent anywhere by filing
 * one. It reaches a prompt only when a Weekly Session is started, and that path
 * has its own gate. Refusing to let an athlete record how they feel because a
 * consent they have not yet given covers a thing they have not yet done would be
 * the gate doing something other than its job.
 *
 * The scores are validated again in the repository, which is what actually
 * refuses a partial one — this action's job is to say who is asking and which
 * week it is.
 */
export async function saveCheckInAction(report: {
  energy: number;
  body: number;
  sleepQuality: number;
  notableSignal: string | null;
}): Promise<CheckInResult> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;

  try {
    await saveCheckIn(resolved.athlete.id, weekStartOf(dateKey(new Date())), {
      ...report,
      notableSignal: report.notableSignal?.trim() ? report.notableSignal.trim().slice(0, 500) : null,
    });
  } catch {
    // A malformed payload, or a score outside 1-10. The athlete sees a refusal
    // rather than a 500, and nothing is stored.
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true };
}

export type StartWeeklyResult =
  | StartWeeklySessionResult
  | AuthFailure
  | ConsentFailure;

export async function startWeeklySessionAction(): Promise<StartWeeklyResult> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;
  if (!(await aiConsentOk(resolved.athlete.id))) {
    return { ok: false, reason: 'consent-required' };
  }

  return startWeeklySession(resolved.athlete, dateKey(new Date()), resolved.language);
}

export async function sendWeeklyMessageAction(
  conversationId: string,
  content: string,
): Promise<ContinueResult | AuthFailure | ConsentFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;
  if (!(await aiConsentOk(resolved.athlete.id))) {
    return { ok: false, reason: 'consent-required' };
  }

  return continueWeeklySession(
    resolved.athlete,
    conversationId,
    content,
    dateKey(new Date()),
    resolved.language,
  );
}

/** The athlete confirmed the proposal — write it and refresh the calendar. */
export async function commitWeeklyPlanAction(
  conversationId: string,
): Promise<CommitResult | AuthFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;

  const result = await commitWeeklyPlan(
    resolved.athlete,
    conversationId,
    dateKey(new Date()),
  );
  // The confirmed plan lands in the calendar — refresh it so the new week shows.
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** The athlete cancelled the proposal — nothing is written. */
export async function declineWeeklyPlanAction(
  conversationId: string,
): Promise<DeclineResult | AuthFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;

  return declineWeeklyPlan(resolved.athlete, conversationId);
}
