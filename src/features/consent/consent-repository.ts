import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { consent } from '@/db/schema';
import { DISCLOSURE_VERSION, type ConsentPurpose } from './disclosure';
import type { ActiveConsent } from './consent';

/**
 * The only place the app reads and writes consent rows.
 *
 * Every call is scoped to one athlete by construction (ADR 0006): the queries
 * filter on `athlete_id`, so no shape of them touches another athlete's consent.
 * The append-only history lives in the table; this module exposes just the three
 * operations the gate and the screen need — read the active grants, grant a
 * purpose, withdraw a purpose.
 */

/**
 * The active grant for one (athlete, purpose): athlete-scoped and un-withdrawn.
 * Every read and write here targets exactly this row, so the predicate is named
 * once and shared — the athlete scoping (ADR 0006) is then a single place to get
 * right, not three.
 */
function activeGrant(athleteId: string, purpose: ConsentPurpose) {
  return and(
    eq(consent.athleteId, athleteId),
    eq(consent.purpose, purpose),
    isNull(consent.withdrawnAt),
  );
}

/**
 * The athlete's currently-active (un-withdrawn) consents, reduced to what a
 * decision needs. Withdrawn rows are excluded here, so the decision layer never
 * has to reason about them — a withdrawn purpose is simply absent.
 */
export async function getActiveConsents(
  athleteId: string,
): Promise<ActiveConsent[]> {
  const rows = await getDb()
    .select({
      purpose: consent.purpose,
      disclosureVersion: consent.disclosureVersion,
    })
    .from(consent)
    .where(and(eq(consent.athleteId, athleteId), isNull(consent.withdrawnAt)));

  // `purpose` is a closed set at the database (the check constraint), so the
  // stored value is always a ConsentPurpose; the cast records that invariant.
  return rows as ActiveConsent[];
}

/**
 * Grants one purpose under the current disclosure version.
 *
 * Idempotent: if the purpose is already granted under the current version,
 * nothing is written — a double-submit does not pile up rows. Otherwise any
 * stale-version active grant for the purpose is superseded (withdrawn) and a
 * fresh current-version row inserted, both in one batch so the partial unique
 * index never sees two active rows for the pair.
 */
export async function grantConsent(
  athleteId: string,
  purpose: ConsentPurpose,
): Promise<void> {
  const db = getDb();

  const active = await db
    .select({ disclosureVersion: consent.disclosureVersion })
    .from(consent)
    .where(activeGrant(athleteId, purpose));

  if (active.some((r) => r.disclosureVersion === DISCLOSURE_VERSION)) return;

  await db.batch([
    // Supersede a stale-version active grant, if any — its `withdrawn_at` is set,
    // so it drops out of the partial unique index before the insert runs.
    db
      .update(consent)
      .set({ withdrawnAt: new Date() })
      .where(activeGrant(athleteId, purpose)),
    db.insert(consent).values({
      athleteId,
      purpose,
      disclosureVersion: DISCLOSURE_VERSION,
    }),
  ]);
}

/**
 * Withdraws a purpose — stamps `withdrawn_at` on the athlete's active grant for
 * it. Idempotent: a purpose with no active grant simply updates nothing. The
 * withdrawn row stays as history; a later re-grant inserts a new row.
 */
export async function withdrawConsent(
  athleteId: string,
  purpose: ConsentPurpose,
): Promise<void> {
  await getDb()
    .update(consent)
    .set({ withdrawnAt: new Date() })
    .where(activeGrant(athleteId, purpose));
}
