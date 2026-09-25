import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { getDb } from '@/db';
import {
  detectedActivities,
  historyImport,
  RUNNING_IMPORT_STATUSES,
  sessions,
  sessionStreams,
  type HistoryImportRow,
  type HistoryImportStatus,
} from '@/db/schema';
import { athleteProfileMerge, getAthleteById } from '@/features/athlete/athlete-repository';
import { getSessionsOnDates } from '@/features/session/session-repository';
import type { ParsedSession } from './garmin';
import { proposalRows } from './garmin-import';
import { externalIdOf, planHistoryImport } from './history-import';
import { deleteAthleteBlobs } from './blob-store';

/**
 * Writing an uploaded training history (`garmin-integration/03`, `04`).
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
 *
 * Since `04` the upload is read in chunks by a background worker, and this is
 * the per-chunk writer: each chunk's history, proposals and the import's
 * progress land in one `db.batch`, so a failure leaves no half-written chunk
 * and no counter ahead of what was written. The unpacking phase saves its
 * place through it too, with no activities. **The lock** —
 * `historyImportedAt` on the profile — is no longer taken here but when the
 * athlete presses *Import* ({@link startHistoryImport}).
 *
 * It never fills a block and never drafts a week (ruling 14): what the athlete
 * uploads counts from the next week's draft on. The current week is not
 * redrawn because a file arrived.
 */
export type HistoryChunkResult = { imported: number; proposed: number };

/** One statement a batch can carry. */
type BatchStatement = BatchItem<'pg'>;

/** A step's progress as {@link importProgressWrite} builds it: the guard, then the update. */
export type ProgressWrite = readonly [BatchStatement, BatchStatement];

export async function importTrainingHistory(
  athleteId: string,
  parsed: readonly ParsedSession[],
  progress: ProgressWrite,
): Promise<HistoryChunkResult> {
  if (parsed.length === 0) {
    await getDb().batch(progress);
    return { imported: 0, proposed: 0 };
  }

  const days = [...new Set(parsed.map((p) => p.date))];
  const [planned, knownIds] = await Promise.all([getSessionsOnDates(athleteId, days), knownExternalIds(athleteId)]);
  const plan = planHistoryImport(parsed, { planned, knownIds });

  // The progress write goes first: its guard has to run before anything else
  // is written, and it is always there, which gives the batch the non-empty
  // tuple type it asks for.
  await getDb().batch([...progress, ...historyWrites(athleteId, plan.history), ...proposalWrites(athleteId, plan.proposals, planned)]);

  return { imported: plan.history.length, proposed: plan.proposals.length };
}

/** An import's next counters, as `advanceUnpack` or `advanceImport` computes them. */
export type ImportProgressChange = Pick<
  HistoryImportRow,
  'blobUrls' | 'cursor' | 'total' | 'done' | 'skippedOld' | 'failed' | 'status'
>;

/** Where a worker read an import: its phase and its cursor in that phase. */
export type ImportReadAt = { status: HistoryImportStatus; cursor: number };

/**
 * The writes that record a step's progress, conditional on the status and
 * cursor it was read at. The status is part of it because both phases start at
 * cursor 0.
 *
 * Two statements, for the front of the step's batch. The guard locks the
 * import row as it was read and divides by how many rows that found. When
 * another worker moved the import first (the cron and the post-Import run can
 * overlap), or the bulk remove or an erasure deleted it, that is zero, and the
 * division fails the whole batch. So the step's history and proposals never
 * land without its progress, and the worker stops. Without the guard the
 * update would match no row and the inserts beside it would still run.
 *
 * This is the only write that moves `updated_at`, so it measures progress and
 * nothing else: a step that fails writes none of it, and the stall rule
 * ({@link failStalledImports}) reads it. A step that lands clears the error an
 * earlier attempt recorded.
 */
export function importProgressWrite(importId: string, readAt: ImportReadAt, next: ImportProgressChange): ProgressWrite {
  const db = getDb();
  const asRead = and(eq(historyImport.id, importId), eq(historyImport.status, readAt.status), eq(historyImport.cursor, readAt.cursor));
  return [
    db.execute(sql`select 1 / count(*) from (select 1 from ${historyImport} where ${asRead} for update) as held`),
    db
      .update(historyImport)
      .set({ ...next, error: null, updatedAt: new Date() })
      .where(asRead),
  ];
}

export type StartImportResult = { ok: true; importId: string } | { ok: false; reason: 'locked' };

/**
 * Takes the lock and opens the import, in one batch, when the athlete presses
 * *Import*. One import's worth of history is on file at a time (ballots 5, 11):
 * a second start is refused while the lock is held, and the partial unique
 * index on `history_import` refuses one that races past this read.
 */
export async function startHistoryImport(athleteId: string, blobUrls: readonly string[]): Promise<StartImportResult> {
  const athlete = await getAthleteById(athleteId);
  if (!athlete || athlete.profile?.historyImportedAt) return { ok: false, reason: 'locked' };

  const db = getDb();
  const importId = randomUUID();
  await db.batch([
    athleteProfileMerge(athleteId, { historyImportedAt: new Date().toISOString() }),
    db.insert(historyImport).values({ id: importId, athleteId, status: 'unpacking', blobUrls: [...blobUrls] }),
  ]);
  return { ok: true, importId };
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
 *
 * The import rows go in the same batch. A worker still running fails its next
 * save on the missing row ({@link importProgressWrite}) and stops, writing
 * nothing more. Then whatever history uploads are left in Blob go too.
 */
export async function removeImportedHistory(athleteId: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.delete(sessions).where(and(eq(sessions.athleteId, athleteId), eq(sessions.origin, 'garmin'))),
    db.delete(historyImport).where(eq(historyImport.athleteId, athleteId)),
    athleteProfileMerge(athleteId, { historyImportedAt: null }),
  ]);
  await deleteAthleteBlobs(athleteId, 'history');
}

/** How many imported history sessions the athlete has — what Settings shows beside the lock. */
export async function countImportedHistory(athleteId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(sessions)
    .where(and(eq(sessions.athleteId, athleteId), eq(sessions.origin, 'garmin')));
  return row?.n ?? 0;
}

/** One import by id — what the worker reads before each step. */
export async function getHistoryImport(importId: string): Promise<HistoryImportRow | undefined> {
  const [row] = await getDb().select().from(historyImport).where(eq(historyImport.id, importId)).limit(1);
  return row;
}

/** The athlete's newest import, running or finished — what the screen polls. */
export async function latestHistoryImport(athleteId: string): Promise<HistoryImportRow | null> {
  const [row] = await getDb()
    .select()
    .from(historyImport)
    .where(eq(historyImport.athleteId, athleteId))
    .orderBy(desc(historyImport.createdAt))
    .limit(1);
  return row ?? null;
}

/** The phases the worker drives — the cron resumes an import in either. */
const WORKER_STATUSES: HistoryImportStatus[] = ['unpacking', 'importing'];

/**
 * Running imports nothing has advanced since `untouchedSince`, oldest first —
 * the ones the cron takes over. A run started by *Import* touches its row every
 * step, so it is left alone while it is still going.
 */
export async function importsToResume(untouchedSince: Date, limit: number): Promise<string[]> {
  const rows = await getDb()
    .select({ id: historyImport.id })
    .from(historyImport)
    .where(and(inArray(historyImport.status, WORKER_STATUSES), lt(historyImport.updatedAt, untouchedSince)))
    .orderBy(asc(historyImport.updatedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * Keeps what went wrong on an attempt, on an import still running, without
 * moving `updated_at` — a failed attempt is not progress, so the stall clock
 * keeps running and {@link failStalledImports} ends the import with this error.
 */
export async function recordImportError(importId: string, error: string): Promise<void> {
  await getDb()
    .update(historyImport)
    .set({ error })
    .where(and(eq(historyImport.id, importId), inArray(historyImport.status, [...RUNNING_IMPORT_STATUSES])));
}

/**
 * Ends every running import nothing has advanced since `stalledBefore` (ruling
 * 5a): `failed`, with the last error an attempt caught, or `reason` when none
 * was. One conditional update, so an import that moved meanwhile is left
 * running. Returns the imports it failed, for the caller to delete their blobs.
 */
export async function failStalledImports(stalledBefore: Date, reason: string): Promise<{ id: string; athleteId: string }[]> {
  return getDb()
    .update(historyImport)
    .set({ status: 'failed', error: sql`coalesce(${historyImport.error}, ${reason})`, updatedAt: new Date() })
    .where(and(inArray(historyImport.status, [...RUNNING_IMPORT_STATUSES]), lt(historyImport.updatedAt, stalledBefore)))
    .returning({ id: historyImport.id, athleteId: historyImport.athleteId });
}
