import type { AthleteRow } from '@/db/schema';

/**
 * The athlete, as the app knows one.
 *
 * Deliberately narrower than the stored row: it carries what the app reads
 * today, not every column the schema holds. Slices widen it as they start
 * reading more — a field arrives here when something renders it, not when a
 * migration adds it.
 *
 * `id` is the opaque key training data hangs off (ADR 0006). `displayName` is
 * athlete-chosen (route ticket 05), not login identity — real names and emails
 * live in better-auth's tables and are reached only through the user seam.
 */
export type Athlete = {
  id: string;
  displayName: string;
};

/** The one place the stored row becomes a domain object. */
export function toAthlete(row: AthleteRow): Athlete {
  return {
    id: row.id,
    displayName: row.displayName,
  };
}
