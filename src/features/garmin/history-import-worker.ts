import { parseUpload } from './garmin-import';
import type { ParsedSession } from './garmin';
import {
  advanceImport,
  expandUpload,
  HISTORY_WINDOW_WEEKS,
  IMPORT_CHUNK_FILES,
  withinWindow,
  type ChunkOutcome,
  type UploadedFile,
} from './blob-upload';
import { getHistoryImport, importProgressWrite, importsToResume, importTrainingHistory } from './history-import-service';

/**
 * The history import's background worker (`garmin-integration/04`).
 *
 * The athlete's files are already in Blob when *Import* is pressed. From then
 * on the import is read 25 files per step: the first blob is downloaded and
 * opened, the step's files are parsed with the same parser detection uses,
 * activities older than the window are dropped and counted, and the rest go
 * through the history writer with the import's new counters in the same batch.
 * A blob is deleted once its last file is read.
 *
 * Steps run right after *Import* (`after()` in the action) and from the cron
 * every few minutes, so an import survives the athlete leaving the page and a
 * function timing out part-way. Blob and the clock come in as `deps`; the
 * database goes through the history-import service.
 */
export type WorkerDeps = {
  fetchBlob: (url: string) => Promise<Uint8Array | null>;
  deleteBlob: (url: string) => Promise<void>;
  today: () => string;
};

/** What a step left behind: more to read, finished, or nothing to do (gone, removed, already done). */
export type StepResult = 'importing' | 'done' | 'stopped';

/** Reads the next up-to-25 files of an import and records where it got to. */
export async function importNextChunk(importId: string, deps: WorkerDeps): Promise<StepResult> {
  const row = await getHistoryImport(importId);
  if (!row || row.status !== 'importing') return 'stopped';

  const [head] = row.blobUrls;
  const { chunk, recent } = head ? await readChunk(head, row.cursor, deps) : { chunk: NOTHING_READ, recent: [] };
  const { finishedBlob, ...next } = advanceImport(row, chunk);

  await importTrainingHistory(row.athleteId, recent, importProgressWrite(importId, row.cursor, next));
  if (finishedBlob) await deleteQuietly(finishedBlob, deps);
  return next.status;
}

const NOTHING_READ: ChunkOutcome = { blobTotal: 0, blobFailed: 0, read: 0, failed: 0, skippedOld: 0 };

/** A blob that is gone counts as one file that failed. */
const BLOB_GONE: ChunkOutcome = { ...NOTHING_READ, blobFailed: 1 };

/** Opens the blob, parses the step's files, and splits the activities by the window. */
async function readChunk(url: string, cursor: number, deps: WorkerDeps): Promise<{ chunk: ChunkOutcome; recent: ParsedSession[] }> {
  const bytes = await deps.fetchBlob(url);
  if (!bytes) return { chunk: BLOB_GONE, recent: [] };

  const found = expandUpload(blobName(url), bytes, { from: cursor, to: cursor + IMPORT_CHUNK_FILES });
  const { activities, failed } = await parseAll(found.files);
  const today = deps.today();
  const recent = activities.filter((a) => withinWindow(a.date, today, HISTORY_WINDOW_WEEKS));
  return {
    chunk: { blobTotal: found.total, blobFailed: found.failed, read: found.files.length, failed, skippedOld: activities.length - recent.length },
    recent,
  };
}

/** Every file parsed on its own: a file that fails is counted and does not stop the rest. */
async function parseAll(files: readonly UploadedFile[]): Promise<{ activities: ParsedSession[]; failed: number }> {
  const activities: ParsedSession[] = [];
  let failed = 0;
  for (const file of files) {
    const read = await parseUpload(file.name, Buffer.from(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength));
    if (read.ok) activities.push(...read.sessions);
    else failed++;
  }
  return { activities, failed };
}

/** The uploaded file's own name — the last path segment, which keeps its extension. */
function blobName(url: string): string {
  const path = new URL(url).pathname;
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
}

/** A failed delete does not fail the step: the 24 h sweep removes what is left. */
async function deleteQuietly(url: string, deps: WorkerDeps): Promise<void> {
  try {
    await deps.deleteBlob(url);
  } catch {
    // Left for sweepOldBlobs.
  }
}

/**
 * Runs an import step after step until it is finished or `timeUp` says to stop.
 * One download per blob: a zip is read over many steps, so the bytes are kept
 * for as long as the same blob is at the head. An error stops the run without
 * throwing — the import stays `importing` and the cron picks it up again. Only
 * the import id is logged, never a file or a URL.
 */
export async function runHistoryImport(importId: string, deps: WorkerDeps, timeUp: () => boolean): Promise<void> {
  const cached = { ...deps, fetchBlob: lastBlobOnly(deps.fetchBlob) };
  try {
    while (!timeUp()) {
      if ((await importNextChunk(importId, cached)) !== 'importing') return;
    }
  } catch {
    console.error('history import stopped', importId);
  }
}

/** `fetchBlob`, remembering the last blob it downloaded. */
function lastBlobOnly(fetchBlob: WorkerDeps['fetchBlob']): WorkerDeps['fetchBlob'] {
  let last: { url: string; bytes: Promise<Uint8Array | null> } | null = null;
  return (url) => {
    if (last?.url !== url) last = { url, bytes: fetchBlob(url) };
    return last.bytes;
  };
}

/** How long an import must sit untouched before the cron takes it — a run started by *Import* may still hold it. */
const RESUME_AFTER_MS = 60_000;

/** At most this many imports per cron run. */
const RESUME_LIMIT = 5;

/**
 * The cron's half: every import still `importing` that nothing has advanced
 * for a minute, run in turn while time allows. Returns how many it ran.
 */
export async function resumeImports(deps: WorkerDeps, now: Date, timeUp: () => boolean): Promise<number> {
  const ids = await importsToResume(new Date(now.getTime() - RESUME_AFTER_MS), RESUME_LIMIT);
  let ran = 0;
  for (const id of ids) {
    if (timeUp()) break;
    await runHistoryImport(id, deps, timeUp);
    ran++;
  }
  return ran;
}

/**
 * How long a run keeps starting steps: under a minute, so a step that starts
 * just before the budget is out still finishes inside the function's time.
 * What is left over is the cron's.
 */
export const IMPORT_TIME_BUDGET_MS = 50_000;

/** A `timeUp` for {@link runHistoryImport}: true once `ms` have passed since it was made. */
export function timeBudget(ms: number): () => boolean {
  const end = Date.now() + ms;
  return () => Date.now() >= end;
}
