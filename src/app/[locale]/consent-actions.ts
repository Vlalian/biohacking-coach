'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import {
  grantConsent,
  withdrawConsent,
} from '@/features/consent/consent-repository';
import { isConsentPurpose } from '@/features/consent/disclosure';

/**
 * Server actions for consent. The acting athlete is resolved from the
 * authenticated session — never from the request body (ADR 0006) — so a client
 * can only ever grant or withdraw its own consent. Every purpose is validated
 * against the known set before it reaches the repository; an unknown purpose is
 * refused, not stored.
 *
 * On success the layout is revalidated: granting the last required purpose lifts
 * the consent gate on the next render, and withdrawing a required purpose drops
 * it back into place.
 */

export type ConsentActionResult =
  | { ok: true }
  | { ok: false; reason: 'not-authenticated' | 'invalid-purpose' };

/** Resolves the acting athlete's opaque id from the session, or null. */
async function actingAthleteId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const athlete = await getAthleteByUserId(session.user.id);
  return athlete?.id ?? null;
}

/**
 * Grants a set of purposes. The consent screen submits the purposes the athlete
 * ticked; each is granted under the current disclosure version. An empty set is
 * a no-op success. Any unrecognised purpose refuses the whole call rather than
 * silently granting a subset.
 */
export async function grantConsentsAction(
  purposes: string[],
): Promise<ConsentActionResult> {
  if (!purposes.every(isConsentPurpose)) {
    return { ok: false, reason: 'invalid-purpose' };
  }

  const athleteId = await actingAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  // De-duplicate so a repeated purpose in the payload is one grant.
  for (const purpose of new Set(purposes)) {
    if (isConsentPurpose(purpose)) await grantConsent(athleteId, purpose);
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Withdraws one purpose. Idempotent — withdrawing an ungranted purpose is fine. */
export async function withdrawConsentAction(
  purpose: string,
): Promise<ConsentActionResult> {
  if (!isConsentPurpose(purpose)) {
    return { ok: false, reason: 'invalid-purpose' };
  }

  const athleteId = await actingAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  await withdrawConsent(athleteId, purpose);

  revalidatePath('/', 'layout');
  return { ok: true };
}
