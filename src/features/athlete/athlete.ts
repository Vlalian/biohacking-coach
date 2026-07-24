import type { AthleteRow } from '@/db/schema';

/**
 * The athlete, as the app knows one.
 *
 * Deliberately narrower than the stored row: it carries what the app reads
 * today, not every column the schema holds. Slices widen it as they start
 * reading more — a field arrives here when something renders it, not when a
 * migration adds it.
 *
 * `id` is the opaque key training data hangs off (ADR 0006). There is no name
 * here: a real athlete's name is `user.name` in better-auth's tables, reached
 * through the user seam, so this object is deliberately usable without it.
 * `syntheticLabel` is the fabricated name of a synthetic athlete — a row with
 * no user — and is null for anyone who can log in (route 06).
 */
export type Athlete = {
  id: string;
  syntheticLabel: string | null;
  /**
   * The stored Information View layout, still untyped here: the information-view
   * feature owns its parsing (`parseLayout`), and this seam just carries what
   * the row holds.
   */
  informationViewLayout: unknown;
};

/** The one place the stored row becomes a domain object. */
export function toAthlete(row: AthleteRow): Athlete {
  return {
    id: row.id,
    syntheticLabel: row.syntheticLabel,
    informationViewLayout: row.informationViewLayout,
  };
}
