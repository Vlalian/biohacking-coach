import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { athlete, coach, erasureLog } from '@/db/schema';
import { user } from '@/db/auth-schema';
import { getActiveConsents } from '@/features/consent/consent-repository';
import { DISCLOSURE_VERSION } from '@/features/consent/disclosure';
import { erasurePlan, toErasureLogEntry } from './erasure';

/**
 * The only place the app erases an account.
 *
 * Almost none of the deleting happens here. Every table hanging off `athlete.id`
 * declares `onDelete: 'cascade'`, so `DELETE FROM athlete` takes sessions,
 * session streams, events, conversations, messages, unavailable dates, equipment
 * items, coaching links and consents with it — nine tables, none of them named
 * in this file. That is deliberate: a list here would be a second source of truth
 * for "what belongs to an athlete", and it would go stale the first time someone
 * adds a table. `erasure-schema.test.ts` walks the schema instead and fails if a
 * table below `athlete` ever stops cascading.
 *
 * What this file owns is the part the database will not do for itself: the
 * **order**, and the log row that outlives the erasure.
 */

/** Whose account is being erased — all three ids resolved by the caller, from the session. */
export interface ErasureSubject {
  athleteId: string;
  userId: string;
  /** Their Head Coach capacity, if they hold one. Null is the normal case. */
  coachId: string | null;
}

/**
 * Erases an account and everything gathered from it. Irreversible, immediate,
 * and with no soft-delete window (decided 2026-08-27 — PRIV-3's 30 days is an
 * outer bound on the obligation, not a target, and a window would put an "and
 * not pending-deletion" clause on every read path in the app).
 *
 * The log is written **first**, before anything is destroyed. If a delete fails
 * part-way, the erasure leaves evidence that it was attempted; the other order
 * loses the consent rows and the record of them together.
 *
 * The deletes then run in the order {@link erasurePlan} gives, which the foreign
 * keys force rather than merely prefer: `athlete.userId` and `coach.userId`
 * declare no `onDelete`, so the `user` row cannot go while either still points
 * at it. Deleting the user last then cascades better-auth's `session` and
 * `account` rows on its own.
 *
 * The caller resolves all three ids from the authenticated session, never from
 * a request body (ADR 0006) — there is deliberately no parameter here that would
 * let a client name someone else's account.
 */
export async function eraseAccount(subject: ErasureSubject): Promise<void> {
  const db = getDb();

  // The disclosure version is supplied here, at the edge, rather than reached
  // for inside the pure module — see `toErasureLogEntry`.
  await db.insert(erasureLog).values(
    toErasureLogEntry(await getActiveConsents(subject.athleteId), DISCLOSURE_VERSION),
  );

  for (const step of erasurePlan(subject)) {
    switch (step) {
      case 'athlete':
        await db.delete(athlete).where(eq(athlete.id, subject.athleteId));
        break;
      case 'coach':
        // Unreachable with a null coachId — `erasurePlan` omits the step — but
        // the guard keeps the narrowing honest rather than asserting it.
        if (subject.coachId) {
          await db.delete(coach).where(eq(coach.id, subject.coachId));
        }
        break;
      case 'user':
        await db.delete(user).where(eq(user.id, subject.userId));
        break;
    }
  }
}
