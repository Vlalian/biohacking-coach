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
