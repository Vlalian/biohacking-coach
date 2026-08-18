'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId } from './current-actor';
import { rateSession, type RateResult } from '@/features/session/rate-session';

export type RateActionResult =
  | RateResult
  | { ok: false; reason: 'not-authenticated' };

/**
 * Server action for a Session Reflection.
 *
 * The rating athlete is resolved here from the authenticated session; the client
 * sends only which session and the scores. Authority and validation live in
 * {@link rateSession}; this wires the request to it and revalidates the calendar
 * so the rated state shows.
 */
export async function rateSessionAction(
  sessionId: string,
  body: number,
  mind: number,
  comment: string | null,
): Promise<RateActionResult> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await rateSession({
    athleteId,
    sessionId,
    body,
    mind,
    comment,
  });

  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
