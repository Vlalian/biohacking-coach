import {
  DISCLOSURE_VERSION,
  REQUIRED_CONSENT_PURPOSES,
  type ConsentPurpose,
} from './disclosure';

/**
 * The consent decision logic — pure, framework-free, no I/O. It takes the
 * athlete's currently-active consents as plain data and answers the questions
 * the gate and the screen ask of them. The repository does the reading and
 * writing; this module only decides.
 *
 * "Active" means un-withdrawn: the repository never returns a withdrawn row, so
 * a purpose the athlete has withdrawn simply does not appear in the input here,
 * and reads as not-granted.
 */

/** An active consent, reduced to what a decision needs: which purpose, which version. */
export interface ActiveConsent {
  purpose: ConsentPurpose;
  disclosureVersion: string;
}

/**
 * Is this purpose granted under the current disclosure version? A grant made
 * under an older version does not count — the wording changed, so the athlete
 * must agree to the new text (see `DISCLOSURE_VERSION`).
 */
export function isConsented(
  active: readonly ActiveConsent[],
  purpose: ConsentPurpose,
  version: string = DISCLOSURE_VERSION,
): boolean {
  return active.some(
    (c) => c.purpose === purpose && c.disclosureVersion === version,
  );
}

/**
 * The required purposes that lack a current-version grant. Empty means the gate
 * opens; anything in it is what the consent screen must still collect before the
 * AI Coach may process the athlete's data.
 */
export function missingRequiredConsents(
  active: readonly ActiveConsent[],
  version: string = DISCLOSURE_VERSION,
): ConsentPurpose[] {
  return REQUIRED_CONSENT_PURPOSES.filter((p) => !isConsented(active, p, version));
}

/**
 * The purposes currently granted under the current version — the set the screen
 * shows as ticked. A purpose granted under a stale version is not included, so
 * it presents as needing re-consent rather than as already agreed.
 */
export function currentlyConsentedPurposes(
  active: readonly ActiveConsent[],
  version: string = DISCLOSURE_VERSION,
): ConsentPurpose[] {
  return active
    .filter((c) => c.disclosureVersion === version)
    .map((c) => c.purpose);
}
