import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, count, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { detectedActivities, sessions, sessionStreams } from '@/db/schema';
import { athleteProfileMerge, getAthleteById } from '@/features/athlete/athlete-repository';
import { getSessionsOnDates } from '@/features/session/session-repository';
import type { ParsedSession } from './garmin';
import { proposalRows } from './garmin-import';
import { externalIdOf, planHistoryImport } from './history-import';

/**
 * Writing an uploaded training history (`garmin-integration/03`).
 *
 * The seam takes parsed activities, not a file (ballot 2), so the first sync
 * from Garmin's API can call it the way the upload does. What lands:
 *
 * - **History** — every activity with no plan behind its day, written straight
 *   into the record as a completed session of `origin 'garmin'`, feedback
 *   null. No non-history path writes that origin, which is what lets the bulk
 *   remove find exactly these rows and nothing else.
 * - **Proposals** — an activity on a day that still holds a Planned Session
 *   becomes a Detected Activity, the same row detection writes (ballot 6).
 * - **The lock** — `historyImportedAt` on the profile. One import's worth of
 *   history is on file at a time; removing it re-opens the import (ballot 11).
 *
 * All of it lands in one `db.batch`, so a failure leaves no half-imported
 * history and no lock without the history it guards.
 *
 * It never fills a block and never drafts a week (ruling 14): what the athlete
 * uploads counts from the next week's draft on. The current week is not
 * redrawn because a file arrived.
 */
export type HistoryImportResult =
  | { ok: true; imported: number; proposed: number }
  | { ok: false; reason: 'locked' };

export async function importTrainingHistory(
  athleteId: string,
  parsed: readonly ParsedSession[],
  // Kept on the seam for the API sync, which decides what "recent" means; the
  // upload stores everything (ballot 4).
  _today: string,
): Promise<HistoryImportResult> {
  const athlete = await getAthleteById(athleteId);
  if (!athlete || athlete.profile?.historyImportedAt) return { ok: false, reason: 'locked' };
  if (parsed.length === 0) return { ok: true, imported: 0, proposed: 0 };

  const days = [...new Set(parsed.map((p) => p.date))];
  const [planned, knownIds] = await Promise.all([getSessionsOnDates(athleteId, days), knownExternalIds(athleteId)]);
  const plan = planHistoryImport(parsed, { planned, knownIds });

  const db = getDb();
  const lock = athleteProfileMerge(athleteId, { historyImportedAt: new Date().toISOString() });
  await db.batch([lock, ...historyWrites(athleteId, plan.history), ...proposalWrites(athleteId, plan.proposals, planned)]);

  return { ok: true, imported: plan.history.length, proposed: plan.proposals.length };
}

/** The history sessions and their streams, linked by an id chosen here; nothing when there is none. */
function historyWrites(athleteId: string, activities: readonly ParsedSession[]) {
  if (activities.length === 0) return [];
  const db = getDb();
  const history = activities.map((activity) => ({ id: randomUUID(), activity }));
  return [
    db
      .insert(sessions)
      .values(history.map(({ id, activity }) => historySession(athleteId, id, activity)))
      // The known ids were filtered out above; this covers only a second
      // import racing the first past the lock.
      .onConflictDoNothing(),
    db.insert(sessionStreams).values(history.map(({ id, activity }) => ({ sessionId: id, samples: activity.streams }))),
  ];
}

/** The proposals, as detection writes them; nothing when there is none. */
function proposalWrites(
  athleteId: string,
  activities: readonly ParsedSession[],
  planned: Parameters<typeof proposalRows>[2],
) {
  if (activities.length === 0) return [];
  return [getDb().insert(detectedActivities).values(proposalRows(athleteId, activities, planned))];
}

/** One history activity as a completed `garmin` session with no Session Reflection. */
function historySession(athleteId: string, id: string, activity: ParsedSession) {
  return {
    id,
    athleteId,
    date: activity.date,
    type: activity.sessionType,
    origin: 'garmin',
    status: 'completed',
    isTraining: true,
    duration: activity.duration,
    note: activity.note,
    sport: activity.sport,
    summary: activity.summary,
    startTime: activity.startTime ? new Date(activity.startTime) : null,
    externalId: externalIdOf(activity),
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    ratedAt: null,
  };
}

/** Every external id already on file for the athlete — history or a pending proposal. */
async function knownExternalIds(athleteId: string): Promise<Set<string>> {
  const db = getDb();
  const [inSessions, inProposals] = await Promise.all([
    db
      .select({ externalId: sessions.externalId })
      .from(sessions)
      .where(and(eq(sessions.athleteId, athleteId), isNotNull(sessions.externalId))),
    db
      .select({ externalId: detectedActivities.externalId })
      .from(detectedActivities)
      .where(and(eq(detectedActivities.athleteId, athleteId), isNotNull(detectedActivities.externalId))),
  ]);
  return new Set([...inSessions, ...inProposals].map((r) => r.externalId as string));
}

/**
 * The undo for a wrong export (ballots 10–11): every imported history session
 * goes, and the import opens again. Proposals it made are left to the athlete,
 * who decides each one on the calendar as with any Detected Activity.
 */
export async function removeImportedHistory(athleteId: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.delete(sessions).where(and(eq(sessions.athleteId, athleteId), eq(sessions.origin, 'garmin'))),
    athleteProfileMerge(athleteId, { historyImportedAt: null }),
  ]);
}

/** How many imported history sessions the athlete has — what Settings shows beside the lock. */
export async function countImportedHistory(athleteId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(sessions)
    .where(and(eq(sessions.athleteId, athleteId), eq(sessions.origin, 'garmin')));
  return row?.n ?? 0;
}
