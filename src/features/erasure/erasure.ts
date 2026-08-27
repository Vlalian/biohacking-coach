import { DISCLOSURE_VERSION } from '@/features/consent/disclosure';
import type { ActiveConsent } from '@/features/consent/consent';

/**
 * Erasure — the decision half. Pure: data in, a plan and a log entry out. No
 * database, no session, no I/O.
 *
 * The athlete's right to be forgotten (`showable-version/10`; `docs/nfr.md`
 * PRIV-3; `gdpr-decisions.md` B). Almost all of the actual deleting is done by
 * the database: every table hanging off `athlete.id` declares
 * `onDelete: 'cascade'`, so one `DELETE FROM athlete` takes sessions, streams,
 * events, conversations, messages, unavailable dates, equipment, coaching links
 * and consents with it.
 *
 * What is *not* automatic is the order, and that is what this module owns —
 * see {@link erasurePlan}.
 */

/** One row the erasure deletes directly. Everything else cascades off these. */
export type ErasureStep = 'athlete' | 'coach' | 'user';

/**
 * The order the rows must be deleted in. Not a preference — the foreign keys
 * make every other order a runtime error.
 *
 * `athlete.userId → user.id` and `coach.userId → user.id` both declare **no**
 * `onDelete` clause (`src/db/schema.ts:52`, `:246`), so they default to NO
 * ACTION: Postgres refuses to delete the `user` row while either still
 * references it. The user row therefore goes last, and deleting it then cascades
 * better-auth's `session` and `account` rows on its own.
 *
 * The `coach` step is present only for an account that holds one. A Head Coach
 * is a relationship, not a kind of person (CONTEXT.md) — the same account can
 * hold a Roster and train as an athlete — so this is a normal case, not an edge
 * one, and an athlete without a coach row must not have a coach delete attempted
 * against them.
 *
 * Note what makes the coach step possible at all: `conversations.coachId` had no
 * `onDelete` either, so a coach's Coach Briefings about *other* athletes (rows
 * keyed to those athletes' ids, which this erasure never touches) kept the coach
 * row referenced and the delete threw. That FK is now `cascade`; without it this
 * plan is unexecutable for anyone who has ever been a Head Coach.
 */
export function erasurePlan(subject: { coachId: string | null }): ErasureStep[] {
  return subject.coachId
    ? ['athlete', 'coach', 'user']
    : ['athlete', 'user'];
}

/**
 * What the erasure leaves behind — and deliberately the only thing it does.
 *
 * Article 7(1) asks a controller to be able to demonstrate that consent was
 * given. Erasing the consent rows destroys that proof; keeping them retains a
 * record about someone who asked to be forgotten. This entry is the way out of
 * that: it records *that* an account consented to these purposes under these
 * versions and was erased, while carrying nothing that points at whom.
 *
 * The keys here are the whole contract — no athlete id, no user id, no email, no
 * name — and a test asserts exactly that rather than trusting this comment.
 * `consent` was already keyed on the opaque athlete id and carried no identity
 * (ADR 0006), so once the `athlete` and `user` rows are gone the re-identification
 * key has been destroyed by the erasure itself.
 *
 * Decided 2026-08-27 with Mads, over "let the cascade take it" and "retain the
 * consent rows". Flagged in `gdpr-decisions.md` for the privacy review — this is
 * a design decision recorded for a lawyer to check, not legal advice.
 */
export interface ErasureLogEntry {
  /** Each purpose that was active, with the disclosure version it was granted under. */
  consentedPurposes: { purpose: string; disclosureVersion: string }[];
  /** The disclosure version in force at the moment of erasure. */
  disclosureVersion: string;
}

/**
 * Builds the log entry from the athlete's active consents.
 *
 * Each purpose keeps **its own** version rather than being collapsed to one.
 * They can genuinely differ: `grantConsent` supersedes only the purpose being
 * granted, so an optional purpose granted under an older disclosure stays active
 * at that older version while the required ones move forward. Recording a single
 * version across all of them would misstate what was agreed to.
 *
 * `disclosureVersion` is a separate fact from those: the wording in force when
 * the erasure happened, which is what dates the record.
 */
export function toErasureLogEntry(
  active: readonly ActiveConsent[],
): ErasureLogEntry {
  return {
    consentedPurposes: active.map((c) => ({
      purpose: c.purpose,
      disclosureVersion: c.disclosureVersion,
    })),
    disclosureVersion: DISCLOSURE_VERSION,
  };
}
