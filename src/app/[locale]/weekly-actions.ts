'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { getUiPrefs } from '@/features/user-prefs/user-prefs-repository';
import { dateKey } from '@/lib/date';
import type { Athlete } from '@/features/athlete/athlete';
import {
  commitWeeklyPlan,
  continueWeeklySession,
  declineWeeklyPlan,
  startWeeklySession,
  type CommitResult,
  type ContinueResult,
  type DeclineResult,
  type WeeklySessionState,
} from '@/features/coach/weekly-session-service';

/**
 * Server actions for the Weekly Session.
 *
 * The athlete is resolved here from the authenticated session — the client sends
 * only a conversation id and message text, never who they are. The service then
 * checks any client-supplied conversation id against that owner (ADR 0006), so
 * these actions add authentication and the service adds authority.
 *
 * The Coach's language is read here too — from the user's `ui_prefs` (ticket 09),
 * through the user seam, and passed into the service as plain data.
 */

type AuthFailure = { ok: false; reason: 'not-authenticated' };

/** Resolves the signed-in user to their athlete + language, or a failure. */
async function currentAthlete(): Promise<
  { ok: true; athlete: Athlete; language?: string } | AuthFailure
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: 'not-authenticated' };
  const athlete = await getAthleteByUserId(session.user.id);
  if (!athlete) return { ok: false, reason: 'not-authenticated' };
  const prefs = await getUiPrefs(session.user.id);
  return { ok: true, athlete, language: prefs.language };
}

export type StartWeeklyResult =
  | ({ ok: true } & WeeklySessionState)
  | AuthFailure;

export async function startWeeklySessionAction(): Promise<StartWeeklyResult> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;

  const state = await startWeeklySession(
    resolved.athlete,
    dateKey(new Date()),
    resolved.language,
  );
  return { ok: true, ...state };
}

export async function sendWeeklyMessageAction(
  conversationId: string,
  content: string,
): Promise<ContinueResult | AuthFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;

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
