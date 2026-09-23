/**
 * The Race Distances, closed (`training-architecture/02`).
 *
 * Closed rather than free text because the per-distance rules are *bands* —
 * session frequency, when race-pace language becomes meaningful, how late bricks
 * can wait — and a band cannot be looked up from prose.
 *
 * "Other" — a duathlon, an aquabike, a marathon used as a build race — is
 * deliberately absent and deferred to post-test. An athlete outside these four
 * cannot be described accurately until then; that is a real limit, recorded
 * rather than papered over with a free-text escape hatch.
 *
 * In `lib/` rather than beside the onboarding flow for the same reason
 * {@link ../lib/conversation-kinds.ts CONVERSATION_KINDS} is: `db/schema.ts`
 * renders this list into a CHECK constraint, and a feature module importing the
 * schema while the schema imports the feature is a cycle TypeScript resolves
 * into two unrelated copies of every row type. A neutral module is the seam
 * that keeps one list feeding both.
 */
export const RACE_DISTANCES = ['Sprint', 'Olympic', 'Half', 'Full'] as const;

export type RaceDistance = (typeof RACE_DISTANCES)[number];

/**
 * Narrows a stored `distance` column to the closed set, so the per-distance
 * bands compare against the union rather than an open string.
 *
 * `db/schema.ts` renders {@link RACE_DISTANCES} into a CHECK constraint, so a
 * stored row cannot hold anything else; `null` is for the caller that has no
 * race at all, and every band treats it as "nothing to go on" rather than
 * guessing a distance. Mirrors `toSessionOrigin` in `features/session/session.ts`.
 */
export function toRaceDistance(value: string | null | undefined): RaceDistance | null {
  return RACE_DISTANCES.find((distance) => distance === value) ?? null;
}
