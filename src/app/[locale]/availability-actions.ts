'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId } from './current-actor';
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
 * Server action: the athlete marks a date unavailable. The date is untrusted
 * client input, validated before it reaches the rules or the database; `today`
 * is the server's, so the past-date boundary is judged against a clock the
 * client cannot spoof. On success the calendar is revalidated.
 */
export async function markUnavailableDateAction(
  date: string,
): Promise<AvailabilityActionResult> {
  if (!isValidDateKey(date)) return { ok: false, reason: 'invalid-date' };

  const athleteId = await resolveAthleteId();
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

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await clearUnavailableDate({
    athleteId,
    date,
    today: dateKey(new Date()),
  });

  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
