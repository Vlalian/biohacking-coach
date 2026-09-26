'use server';

import { eraseAccount } from '@/features/erasure/erasure-repository';
import { deleteAthleteBlobs } from '@/features/garmin/blob-store';
import { resolveErasureSubject } from '../../current-actor';

/**
 * Account deletion — its own module rather than another export of
 * `settings-actions.ts`.
 *
 * Every other Settings action changes a preference and can be undone by
 * changing it back. This one destroys an athlete's entire record and cannot be
 * undone by anything. Keeping it separate means its mocks, its tests and its
 * review are about erasure and nothing else, and that a change to a preference
 * action can never accidentally reach it.
 *
 * Same two-layer shape as the rest (ADR 0006): the subject is resolved here from
 * the authenticated session, and there is deliberately no parameter naming an
 * account — the only one this can erase is the caller's own.
 */

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: 'not-authenticated' | 'confirmation-mismatch' };

/**
 * Erases the signed-in account and everything gathered from it. Immediate, hard,
 * and irreversible — there is no soft-delete window and nothing to restore from
 * (decided 2026-08-27).
 *
 * `confirmation` is the email the athlete typed into the dialog, re-checked here
 * against the session's own. The UI already disables the button until they
 * match, but a disabled button is not a control — it is a hint, and the only
 * thing standing between a stray request and an unrecoverable delete would
 * otherwise be the browser. Compared case-insensitively and trimmed, because the
 * athlete is retyping their own address and a capital letter is not a reason to
 * refuse them their own right.
 */
export async function deleteMyAccountAction(
  confirmation: string,
): Promise<DeleteAccountResult> {
  const subject = await resolveErasureSubject();
  if (!subject.ok) return { ok: false, reason: 'not-authenticated' };

  const typed = confirmation.trim().toLowerCase();
  if (!typed || typed !== subject.email.trim().toLowerCase()) {
    return { ok: false, reason: 'confirmation-mismatch' };
  }

  await eraseAccount({
    athleteId: subject.athleteId,
    userId: subject.userId,
    coachId: subject.coachId,
  });
  await eraseGarminUploads(subject.athleteId);

  // No revalidation and no redirect from here. The `session` rows went with the
  // user row, so the next request resolves to nobody and the app redirects to
  // sign-in on its own; the client navigates immediately so the athlete does not
  // sit on a page whose data no longer exists.
  return { ok: true };
}

/**
 * The athlete's Garmin uploads still in Blob (`garmin-integration/04`), deleted
 * after the rows — the cascade has already stopped any import reading them.
 * A Blob failure does not undo an erasure that has happened: the 24 h sweep
 * deletes whatever is left, and only that fact is logged, never an id.
 */
async function eraseGarminUploads(athleteId: string): Promise<void> {
  try {
    await deleteAthleteBlobs(athleteId, 'history');
    await deleteAthleteBlobs(athleteId, 'detection');
  } catch {
    console.error('erasure: Garmin uploads left for the sweep');
  }
}
