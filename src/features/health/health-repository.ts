import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  healthNotes,
  illnesses,
  injuries,
  type HealthNoteRow,
  type IllnessRow,
  type InjuryRow,
} from '@/db/schema';
import { capacityStatement, type Capacity } from './capacity';
import { MISTAKE_WINDOW_MS } from './health-layer';

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

/**
 * Opens an Injury with what the athlete says it prevents, and an optional short
 * name for what and where ("left knee" — `showable-version/28a`). The name is
 * for human eyes; the capacity is what the planner reads.
 */
export async function declareInjury(
  athleteId: string,
  capacity: Capacity,
  bother: Bother = null,
  name: string | null = null,
): Promise<void> {
  await getDb().insert(injuries).values({ athleteId, ...capacity, bother, name });
}

/**
 * The Bother Rating, 1–5, or null for "did not say" (`training-architecture/06`).
 * Human eyes only — never read on a prompt path (ADR 0011's detail-thread side;
 * `detail-thread-never-prompts.test.ts` pins it). Validated at the action
 * boundary; the database refuses anything outside 1–5 as well.
 */
export type Bother = number | null;

/** Opens an Illness. It carries no capacity — it removes every discipline. */
export async function declareIllness(athleteId: string, bother: Bother = null): Promise<void> {
  await getDb().insert(illnesses).values({ athleteId, bother });
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

/** Why a "reported by mistake" delete did not happen. */
export type DeleteOutcome = 'deleted' | 'too-old' | 'missing';

/**
 * Removes an Injury the athlete declared by mistake (`showable-version/28a`).
 *
 * Only inside the first 24 hours: after that the record is history — the
 * calendar keeps marking the sessions done hurt, and the Head Coach may have
 * read it. The window, the athlete and the id are all in the one WHERE, so
 * the delete cannot outrun the check; when nothing was deleted, one read says
 * whether the record was too old or was never theirs. Notes cascade with it.
 */
export async function deleteInjury(athleteId: string, injuryId: string, now: Date): Promise<DeleteOutcome> {
  const deleted = await getDb()
    .delete(injuries)
    .where(and(eq(injuries.athleteId, athleteId), eq(injuries.id, injuryId), gt(injuries.openedAt, mistakeCutoff(now))))
    .returning({ id: injuries.id });
  if (deleted.length > 0) return 'deleted';
  return (await ownsSubject(athleteId, { injuryId })) ? 'too-old' : 'missing';
}

/** The same for an Illness. */
export async function deleteIllness(athleteId: string, illnessId: string, now: Date): Promise<DeleteOutcome> {
  const deleted = await getDb()
    .delete(illnesses)
    .where(and(eq(illnesses.athleteId, athleteId), eq(illnesses.id, illnessId), gt(illnesses.openedAt, mistakeCutoff(now))))
    .returning({ id: illnesses.id });
  if (deleted.length > 0) return 'deleted';
  return (await ownsSubject(athleteId, { illnessId })) ? 'too-old' : 'missing';
}

function mistakeCutoff(now: Date): Date {
  return new Date(now.getTime() - MISTAKE_WINDOW_MS);
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
 * Whether this athlete owns the Injury or Illness a note is about.
 *
 * Every read and write of a detail thread goes through here first. The thread is
 * **special-category free text** (GDPR Article 9) — body location, what a physio
 * said — and keying it on the record id alone would make it reachable by anyone
 * who can guess or obtain one. ADR 0006's rule is that training data keys off
 * the opaque athlete id; that this data is the most sensitive in the app makes
 * it the last place to make an exception.
 *
 * A read then a write rather than one statement: the alternative is a subquery
 * that hides the check inside a `where`, and a guarantee this specific is worth
 * being able to see.
 */
async function ownsSubject(
  athleteId: string,
  subject: { injuryId: string } | { illnessId: string },
): Promise<boolean> {
  const rows =
    'injuryId' in subject
      ? await getDb()
          .select({ id: injuries.id })
          .from(injuries)
          .where(and(eq(injuries.id, subject.injuryId), eq(injuries.athleteId, athleteId)))
      : await getDb()
          .select({ id: illnesses.id })
          .from(illnesses)
          .where(and(eq(illnesses.id, subject.illnessId), eq(illnesses.athleteId, athleteId)));

  return rows.length > 0;
}

/**
 * Adds to a record's detail thread, on behalf of an athlete who owns it.
 *
 * **Nothing on the prompt path calls this or its reader.** The thread is
 * documentation for humans (ADR 0011): body location, what a physio said, how it
 * is going. Both the athlete and the Head Coach write to it, which is exactly
 * why it must not reach the model — a Head Coach's clinical note replayed on
 * every later turn is the hazard `narration.ts` already refuses.
 *
 * `athleteId` is the **owner** of the record, not the author. A Head Coach
 * writing on a linked athlete's injury passes that athlete's id and
 * `authorRole: 'head_coach'` — the note belongs to the athlete's record either
 * way, and Link Visibility decides whether the coach may be there at all.
 *
 * Refuses rather than writes when the record is not theirs.
 */
export async function addHealthNote(
  athleteId: string,
  subject: { injuryId: string } | { illnessId: string },
  authorRole: NoteAuthor,
  body: string,
): Promise<void> {
  if (!(await ownsSubject(athleteId, subject))) {
    throw new Error(
      'Refusing to write a health note on a record this athlete does not own. ' +
        'The detail thread is Article 9 data and is never reachable by id alone (ADR 0006).',
    );
  }
  await getDb().insert(healthNotes).values({ ...subject, authorRole, body });
}

/**
 * A record's detail thread, oldest first. For human eyes only.
 *
 * Empty for a record the athlete does not own — the same answer as a record with
 * no notes, deliberately: a caller that could tell "not yours" from "nothing
 * here" could enumerate other people's injuries by id.
 */
export async function getHealthNotes(
  athleteId: string,
  subject: { injuryId: string } | { illnessId: string },
): Promise<HealthNoteRow[]> {
  if (!(await ownsSubject(athleteId, subject))) return [];

  const where =
    'injuryId' in subject
      ? eq(healthNotes.injuryId, subject.injuryId)
      : eq(healthNotes.illnessId, subject.illnessId);

  return getDb().select().from(healthNotes).where(where).orderBy(asc(healthNotes.createdAt));
}

/**
 * What this athlete's body currently allows, as the Coach reads it, or null.
 *
 * The one place the two open-record reads and the rendering are joined. Both
 * the Weekly Session and the Coach Briefing need exactly this, and both were
 * spelling out the same seven lines — two reads, a `.map` into `{ capacity }`,
 * a cast, and `openIllnesses.length > 0`. Duplicated, that shape drifts: the
 * day an Injury grows a fourth discipline, one of the two copies gets it.
 */
export async function capacityFor(athleteId: string): Promise<string | null> {
  const [openInjuries, openIllnesses] = await Promise.all([
    getOpenInjuries(athleteId),
    getOpenIllnesses(athleteId),
  ]);

  return capacityStatement(
    openInjuries.map((injury) => ({
      capacity: { swim: injury.swim, bike: injury.bike, run: injury.run } as Capacity,
    })),
    openIllnesses.length > 0,
  );
}

/**
 * Every Injury and Illness the athlete has had, open and closed, oldest first
 * (`training-architecture/06`). The closed ones are the history the drawer
 * shows collapsed; the open ones are what the calendar draws. Athlete id in the
 * WHERE and nothing else — no `closedAt` filter, because closed *is* the point.
 */
export async function getHealthHistory(
  athleteId: string,
): Promise<{ injuries: InjuryRow[]; illnesses: IllnessRow[] }> {
  const db = getDb();
  const [injuryRows, illnessRows] = await Promise.all([
    db.select().from(injuries).where(eq(injuries.athleteId, athleteId)).orderBy(asc(injuries.openedAt)),
    db.select().from(illnesses).where(eq(illnesses.athleteId, athleteId)).orderBy(asc(illnesses.openedAt)),
  ]);
  return { injuries: injuryRows, illnesses: illnessRows };
}

/**
 * Sets the Bother Rating on a record the athlete owns — the athlete id is in the
 * WHERE beside the record id, so a guessed id changes nothing that is not theirs
 * (ADR 0006). Null clears it.
 */
export async function setBother(
  athleteId: string,
  subject: { injuryId: string } | { illnessId: string },
  bother: Bother,
): Promise<void> {
  const db = getDb();
  if ('injuryId' in subject) {
    await db
      .update(injuries)
      .set({ bother })
      .where(and(eq(injuries.athleteId, athleteId), eq(injuries.id, subject.injuryId)));
    return;
  }
  await db
    .update(illnesses)
    .set({ bother })
    .where(and(eq(illnesses.athleteId, athleteId), eq(illnesses.id, subject.illnessId)));
}
