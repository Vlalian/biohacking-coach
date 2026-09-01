import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  athlete,
  coachingLink,
  consent,
  conversations,
  equipmentItems,
  events,
  messages,
  sessionStreams,
  sessions,
  unavailableDates,
} from '@/db/schema';
import { user } from '@/db/auth-schema';
import type { ExportInput } from './export';

/**
 * The reads behind an athlete's data export.
 *
 * Every one is scoped to the athlete in the query itself — either
 * `athlete_id = :athleteId` directly, or an inner join through the table that
 * carries it (`messages` through `conversations`, `session_streams` through
 * `sessions`). No shape of these calls crosses athletes (ADR 0006), and the
 * scoping is in the WHERE rather than applied afterwards, so a bug cannot leak
 * another athlete's rows into a file the caller then hands to a person.
 *
 * The `user` read is the deliberate exception and takes the **user id**, not the
 * athlete id: it returns the athlete's own name and email because Articles 15
 * and 20 say the copy is of their personal data. See the note in `export.ts`.
 *
 * Deliberately its own reads rather than reuse of the feature repositories:
 * those are shaped for the app's questions ("this week's sessions", "the active
 * consents") and an export needs the unfiltered rows. Reaching into them and
 * widening them for this would bend them out of shape for their real callers.
 */
/**
 * The login behind an athlete id, or null for a synthetic athlete who has none.
 *
 * Lives here rather than on `athlete-repository` on purpose. The domain
 * {@link Athlete} deliberately carries no `userId` — ADR 0006 keeps identity out
 * of the training-side types — and adding one there would put the join back
 * everywhere. The export is the one sanctioned place the two are rejoined, so
 * the read that does it belongs in the export module and nowhere else.
 *
 * Only the command-line export needs it: the route already has the user id from
 * the session, which is a better source than a lookup.
 */
export async function getUserIdForAthlete(athleteId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ userId: athlete.userId })
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1);

  return rows[0]?.userId ?? null;
}

export async function getExportInput(
  athleteId: string,
  userId: string,
): Promise<ExportInput> {
  const db = getDb();

  const [
    athleteRows,
    accountRows,
    sessionRows,
    streamRows,
    eventRows,
    conversationRows,
    messageRows,
    unavailableRows,
    equipmentRows,
    consentRows,
    linkRows,
  ] = await Promise.all([
    db.select().from(athlete).where(eq(athlete.id, athleteId)),
    // Name and email only — the rest of better-auth's user row (password hashes
    // live on `account`, tokens on `session`) is not the athlete's personal data
    // in any useful sense and is credential material.
    db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId)),
    db.select().from(sessions).where(eq(sessions.athleteId, athleteId)),
    db
      .select()
      .from(sessionStreams)
      .innerJoin(sessions, eq(sessionStreams.sessionId, sessions.id))
      .where(eq(sessions.athleteId, athleteId)),
    db.select().from(events).where(eq(events.athleteId, athleteId)),
    db.select().from(conversations).where(eq(conversations.athleteId, athleteId)),
    db
      .select()
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.athleteId, athleteId)),
    db
      .select()
      .from(unavailableDates)
      .where(eq(unavailableDates.athleteId, athleteId)),
    db.select().from(equipmentItems).where(eq(equipmentItems.athleteId, athleteId)),
    db.select().from(consent).where(eq(consent.athleteId, athleteId)),
    db.select().from(coachingLink).where(eq(coachingLink.athleteId, athleteId)),
  ]);

  return {
    account: accountRows[0] ?? null,
    athlete: athleteRows[0] ?? null,
    sessions: sessionRows,
    sessionStreams: streamRows,
    events: eventRows,
    conversations: conversationRows,
    messages: messageRows,
    unavailableDates: unavailableRows,
    equipmentItems: equipmentRows,
    consents: consentRows,
    coachingLinks: linkRows,
  };
}
