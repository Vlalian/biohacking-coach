import { parseUpload } from './garmin-import';
import type { ParsedSession } from './garmin';
import type { HistoryImportRow } from '@/db/schema';
import {
  advanceImport,
  advanceUnpack,
  extractedPathname,
  HISTORY_WINDOW_WEEKS,
  IMPORT_CHUNK_FILES,
  importRunning,
  nextZip,
  withinWindow,
  type UnpackOutcome,
} from './blob-upload';
import { unpackZipStream, type UnpackedEntry } from './export-unpacker';
import { getHistoryImport, importProgressWrite, importsToResume, importTrainingHistory } from './history-import-service';

/**
 * The history import's background worker (`garmin-integration/04`).
 *
 * The athlete's files are already in Blob when *Import* is pressed. The import
 * then runs in two phases, the row's status saying which:
 *
 * - **unpacking** — each uploaded zip is streamed from Blob once, through the
 *   unpacker, and every `.fit`/`.gpx` in it becomes its own private blob. The
 *   place in the zip is saved every 25 entries, so a run that runs out of time
 *   or crashes resumes at the next entry. A zip read to its end is deleted.
 * - **importing** — 25 single-file blobs per step are parsed with the same
 *   parser detection uses, activities older than the window are dropped and
 *   counted, the rest go through the history writer with the import's new
 *   counters in the same batch, and each blob is deleted once written.
 *
 * Steps run right after *Import* (`after()` in the action) and from the cron
 * every few minutes, so an import survives the athlete leaving the page and a
 * function timing out part-way. Every save is conditional on the status and
 * cursor it was read at, so two runs that overlap cannot both move it. Blob
 * and the clock come in as `deps`; the database goes through the
 * history-import service.
 */
export type WorkerDeps = {
  fetchBlob: (url: string) => Promise<Uint8Array | null>;
  openBlob: (url: string) => Promise<ReadableStream<Uint8Array> | null>;
  putBlob: (pathname: string, bytes: Uint8Array) => Promise<string>;
  deleteBlob: (url: string) => Promise<void>;
  today: () => string;
};

/** What a step left behind: more to do, finished, or nothing to do (gone, removed, already done). */
export type StepResult = 'unpacking' | 'importing' | 'done' | 'stopped';

/**
 * One step of an import: unpack the next zip as far as time allows, or import
 * the next 25 files.
 *
 * Export-for-test: {@link runHistoryImport} is the caller; reaching each
 * phase's edge cases through its loop needs a time budget per case. Delete
 * freely if the step is inlined.
 */
export async function importNextChunk(importId: string, deps: WorkerDeps, timeUp: () => boolean): Promise<StepResult> {
  const row = await getHistoryImport(importId);
  if (row?.status === 'unpacking') return unpackNextZip(row, deps, timeUp);
  if (row?.status === 'importing') return importNextFiles(row, deps);
  return 'stopped';
}

/** Streams the first zip still in the list into single-file blobs, saving its place as it goes. */
async function unpackNextZip(row: HistoryImportRow, deps: WorkerDeps, timeUp: () => boolean): Promise<StepResult> {
  const zip = nextZip(row.blobUrls);
  const stream = zip && (await deps.openBlob(zip));
  const unpack = new UnpackRun(row, zip, deps);
  // No zip left, or one that is gone: nothing to stream, and the zip (if any) is one failed file.
  if (!stream) return unpack.save({ extracted: [], failed: zip ? 1 : 0, complete: true });
  const complete = await unpackZipStream(stream, row.cursor, (entry, index) => unpack.take(entry, index), timeUp);
  return unpack.save({ ...unpack.pending, complete });
}

/**
 * One run over one zip: extracts each entry to its blob and saves the import
 * every {@link IMPORT_CHUNK_FILES} entries. Entries are numbered after every
 * entry of the zips before this one — `total` counts those, less what of this
 * zip is already counted — so a number never repeats within an import.
 */
class UnpackRun {
  pending = { extracted: [] as string[], failed: 0 };
  private saved: HistoryImportRow;
  private readonly firstNumber: number;

  constructor(
    row: HistoryImportRow,
    private readonly zip: string | null,
    private readonly deps: WorkerDeps,
  ) {
    this.saved = row;
    this.firstNumber = row.total - row.cursor;
  }

  async take(entry: UnpackedEntry, index: number): Promise<void> {
    if (entry.kind === 'file') {
      const pathname = extractedPathname(this.saved.athleteId, this.saved.id, this.firstNumber + index, entry.name);
      this.pending.extracted.push(await this.deps.putBlob(pathname, entry.bytes));
    } else {
      this.pending.failed++;
    }
    if (this.pending.extracted.length + this.pending.failed >= IMPORT_CHUNK_FILES) await this.save({ ...this.pending, complete: false });
  }

  /** Records what was extracted since the last save; a zip read to its end is then deleted. */
  async save(outcome: UnpackOutcome): Promise<StepResult> {
    const { finishedZip, ...next } = advanceUnpack(this.saved, this.zip, outcome);
    const write = importProgressWrite(this.saved.id, { status: 'unpacking', cursor: this.saved.cursor }, next);
    await importTrainingHistory(this.saved.athleteId, [], write);
    this.saved = { ...this.saved, ...next };
    this.pending = { extracted: [], failed: 0 };
    if (finishedZip) await deleteQuietly(finishedZip, this.deps);
    return next.status;
  }
}

/** Imports the next up-to-25 single-file blobs, then deletes each. */
async function importNextFiles(row: HistoryImportRow, deps: WorkerDeps): Promise<StepResult> {
  const urls = row.blobUrls.slice(0, IMPORT_CHUNK_FILES);
  const { activities, failed } = await parseAll(urls, deps);
  const today = deps.today();
  const recent = activities.filter((a) => withinWindow(a.date, today, HISTORY_WINDOW_WEEKS));
  const next = advanceImport(row, { read: urls.length, failed, skippedOld: activities.length - recent.length });

  await importTrainingHistory(row.athleteId, recent, importProgressWrite(row.id, { status: 'importing', cursor: row.cursor }, next));
  for (const url of urls) await deleteQuietly(url, deps);
  return next.status;
}

/** Every file downloaded and parsed on its own: one that is gone or will not parse is counted and does not stop the rest. */
async function parseAll(urls: readonly string[], deps: WorkerDeps): Promise<{ activities: ParsedSession[]; failed: number }> {
  const activities: ParsedSession[] = [];
  let failed = 0;
  for (const url of urls) {
    const bytes = await deps.fetchBlob(url);
    // The URL's path ends in the file's name, and only its extension is read.
    const read = bytes ? await parseUpload(new URL(url).pathname, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)) : null;
    if (read?.ok) activities.push(...read.sessions);
    else failed++;
  }
  return { activities, failed };
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
 * Runs an import step after step until it is finished or `timeUp` says to
 * stop. An error stops the run without throwing — the import stays where it
 * was last saved and the cron picks it up again. Only the import id is
 * logged, never a file or a URL.
 */
export async function runHistoryImport(importId: string, deps: WorkerDeps, timeUp: () => boolean): Promise<void> {
  try {
    while (!timeUp()) {
      if (!importRunning(await importNextChunk(importId, deps, timeUp))) return;
    }
  } catch {
    console.error('history import stopped', importId);
  }
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
