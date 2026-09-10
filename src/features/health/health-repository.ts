import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  healthNotes,
  illnesses,
  injuries,
  type HealthNoteRow,
  type IllnessRow,
  type InjuryRow,
} from '@/db/schema';
import type { Capacity } from './capacity';

/**
 * Injuries and Illnesses, read and written (`training-architecture/04`).
 *
 * **Declaring or closing one never touches a session.** No status, no placement,
 * no parked flag — nothing here writes to `sessions` at all, which is how the
 * acceptance criterion is kept rather than by remembering not to. Nothing is
 * destroyed, so nothing has to be restored when the athlete recovers, and the
 * unattempted sessions resolve the ordinary way at the next Weekly Session.
 */

/** Who wrote a note on the detail thread. */
export type NoteAuthor = 'athlete' | 'head_coach';

/** Opens an Injury with what the athlete says it prevents. */
export async function declareInjury(athleteId: string, capacity: Capacity): Promise<void> {
  await getDb().insert(injuries).values({ athleteId, ...capacity });
}

/** Opens an Illness. It carries no capacity — it removes every discipline. */
export async function declareIllness(athleteId: string): Promise<void> {
  await getDb().insert(illnesses).values({ athleteId });
}

/**
 * Marks an Injury over.
 *
 * Scoped by athlete as well as id, so a forged id cannot close someone else's
 * (ADR 0006 — every training read and write keys off the opaque athlete id).
 */
export async function closeInjury(athleteId: string, injuryId: string): Promise<void> {
  await getDb()
    .update(injuries)
    .set({ closedAt: new Date() })
    .where(and(eq(injuries.athleteId, athleteId), eq(injuries.id, injuryId)));
}

/** Marks an Illness over. Scoped by athlete for the same reason. */
export async function closeIllness(athleteId: string, illnessId: string): Promise<void> {
  await getDb()
    .update(illnesses)
    .set({ closedAt: new Date() })
    .where(and(eq(illnesses.athleteId, athleteId), eq(illnesses.id, illnessId)));
}

/**
 * The athlete's open Injuries — those with no `closedAt`.
 *
 * "Open" is the absence of an end rather than a status column, because an injury
 * has no scheduled end to compare against: it is over when the athlete says so,
 * and until then there is nothing to check but the null.
 */
export async function getOpenInjuries(athleteId: string): Promise<InjuryRow[]> {
  return getDb()
    .select()
    .from(injuries)
    .where(and(eq(injuries.athleteId, athleteId), isNull(injuries.closedAt)))
    .orderBy(asc(injuries.openedAt));
}

/** The athlete's open Illnesses. */
export async function getOpenIllnesses(athleteId: string): Promise<IllnessRow[]> {
  return getDb()
    .select()
    .from(illnesses)
    .where(and(eq(illnesses.athleteId, athleteId), isNull(illnesses.closedAt)))
    .orderBy(asc(illnesses.openedAt));
}

/**
 * Adds to a record's detail thread.
 *
 * **Nothing on the prompt path calls this or its reader.** The thread is
 * documentation for humans (ADR 0011): body location, what a physio said, how it
 * is going. Both the athlete and the Head Coach write to it, which is exactly
 * why it must not reach the model — a Head Coach's clinical note replayed on
 * every later turn is the hazard `narration.ts` already refuses.
 */
export async function addHealthNote(
  subject: { injuryId: string } | { illnessId: string },
  authorRole: NoteAuthor,
  body: string,
): Promise<void> {
  await getDb().insert(healthNotes).values({ ...subject, authorRole, body });
}

/** A record's detail thread, oldest first. For human eyes only. */
export async function getHealthNotes(
  subject: { injuryId: string } | { illnessId: string },
): Promise<HealthNoteRow[]> {
  const where =
    'injuryId' in subject
      ? eq(healthNotes.injuryId, subject.injuryId)
      : eq(healthNotes.illnessId, subject.illnessId);

  return getDb().select().from(healthNotes).where(where).orderBy(asc(healthNotes.createdAt));
}
