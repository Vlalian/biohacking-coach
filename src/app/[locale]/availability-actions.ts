'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import {
  markUnavailableDate,
  clearUnavailableDate,
} from '@/features/availability/unavailable-date';
import { dateKey, isValidDateKey } from '@/lib/date';

/**
 * The outcome the client sees. Beyond the feature's own result it can fail on
 * authentication or a malformed date — the two things resolved in the action,
 * before the feature is reached.
 */
export type AvailabilityActionResult =
  | { ok: true }
  | { ok: false; reason: 'not-authenticated' | 'invalid-date' | 'past-date' };

/**
 * Resolves the acting athlete from the authenticated session — never from the
 * request body (ADR 0006). Returns the opaque athlete id, or null when there is
 * no valid actor to mark days for.
 */
async function actingAthleteId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const athlete = await getAthleteByUserId(session.user.id);
  return athlete?.id ?? null;
}

/**
 * Server action: the athlete marks a date unavailable. The date is untrusted
 * client input, validated before it reaches the rules or the database; `today`
 * is the server's, so the past-date boundary is judged against a clock the
 * client cannot spoof. On success the calendar is revalidated.
 */
export async function markUnavailableDateAction(
  date: string,
): Promise<AvailabilityActionResult> {
  if (!isValidDateKey(date)) return { ok: false, reason: 'invalid-date' };

  const athleteId = await actingAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await markUnavailableDate({
    athleteId,
    date,
    today: dateKey(new Date()),
  });

  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/**
 * Server action: the athlete clears an Unavailable Date. Clearing a future or
 * current day auto-restores that day's parked sessions; a past day keeps them
 * (ADR 0002). The guard lives in the feature; this only wires the request to it.
 */
export async function clearUnavailableDateAction(
  date: string,
): Promise<AvailabilityActionResult> {
  if (!isValidDateKey(date)) return { ok: false, reason: 'invalid-date' };

  const athleteId = await actingAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await clearUnavailableDate({
    athleteId,
    date,
    today: dateKey(new Date()),
  });

  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
