import { daysBetween } from '@/lib/date';
import { unzipSync, type Unzipped, type UnzipFileFilter } from 'fflate';

/**
 * Garmin uploads through Vercel Blob (`garmin-integration/04`) — the pure half.
 *
 * Both uploads go browser → Blob with a short-lived token, because a function
 * body is capped at 4.5 MB on Vercel and a Garmin export is hundreds of MB. The
 * token route, the actions and the import worker are the I/O around this file;
 * every rule they apply is decided here, from plain data. Nothing here reads
 * Blob, the database or the clock.
 */

/** Which of the two Garmin buttons an upload came through. */
export type UploadKind = 'history' | 'detection';

/** The cap on one uploaded history file (Mads, 2026-09-25: "500 MB, for now"). */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * The cap on one detection upload (Mads, 2026-09-25, ruling 6a). The detection
 * action reads its file whole and unzips it in memory, so a full Garmin export
 * sent through the calendar would run a function out of memory; that belongs in
 * the history upload, which streams. One activity, or a small zip of them.
 */
export const MAX_DETECTION_UPLOAD_BYTES = 50 * 1024 * 1024;

/** The cap on one file of this kind of upload. */
export function maxUploadBytes(kind: UploadKind): number {
  return kind === 'detection' ? MAX_DETECTION_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
}

/**
 * The content types the token allows. The browser gives a `.fit` no type and a
 * `.zip` a different one per platform, so the client names one of these from
 * the extension; the extension is what is actually checked ({@link acceptsPathname}).
 */
const ALLOWED_CONTENT_TYPES = ['application/octet-stream', 'application/zip', 'application/gpx+xml', 'application/xml'];

/** Where an athlete's uploads of one kind live in Blob — the opaque id and nothing else. */
export function blobPrefix(kind: UploadKind, athleteId: string): string {
  return `garmin/${kind}/${athleteId}/`;
}

/** Everything the Garmin uploads put in Blob sits under this. */
export const GARMIN_BLOB_ROOT = 'garmin/';

/** How long an upload may sit in Blob before the sweep deletes it, read or not. */
export const BLOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The part of an athlete the upload policy reads. */
type PolicyAthlete = { id: string; profile: { historyImportedAt?: string | null } | null };

/** The policy's input from the signed-in athlete, or from nobody. */
export function uploadState(athlete: PolicyAthlete | null): { athleteId: string | null; historyLocked: boolean } {
  return { athleteId: athlete?.id ?? null, historyLocked: Boolean(athlete?.profile?.historyImportedAt) };
}

/** How long an upload token lives: 500 MB on a slow line takes a while, and no longer is needed. */
export const TOKEN_VALID_MS = 60 * 60 * 1000;

/**
 * The upload kind the client asked for, from `upload()`'s `clientPayload`, or
 * null when it named none the policy knows. Anything else in the payload — an
 * athlete id, say — is ignored: who is uploading comes from the session.
 */
export function uploadKindOf(clientPayload: string | null): UploadKind | null {
  try {
    // `Object()` turns a parsed null or number into an object with no `kind`.
    const { kind } = Object(JSON.parse(String(clientPayload))) as { kind?: unknown };
    return kind === 'history' || kind === 'detection' ? kind : null;
  } catch {
    return null;
  }
}

/**
 * The content type the client sends for a file, from its extension — a `.fit`
 * has none in the browser and a `.zip` has a different one per platform.
 */
export function contentTypeFor(name: string): string {
  if (/\.zip$/i.test(name)) return 'application/zip';
  if (/\.gpx$/i.test(name)) return 'application/gpx+xml';
  return 'application/octet-stream';
}

export type UploadRefusal = 'not-authenticated' | 'locked' | 'bad-kind';

export type UploadPolicy =
  | { ok: true; pathPrefix: string; maximumSizeInBytes: number; allowedContentTypes: string[] }
  | { ok: false; reason: UploadRefusal };

/**
 * Whether this athlete may upload this kind of file now, and on what terms.
 *
 * `state` is resolved by the caller from the authenticated session — never from
 * the request (ADR 0006). A history upload is refused once the import lock is
 * taken; a detection upload is not, because detection has no lock. A kind it
 * does not know — including none — is refused. The path prefix carries only
 * the opaque athlete id.
 */
export function uploadPolicy(kind: UploadKind | null, state: { athleteId: string | null; historyLocked: boolean }): UploadPolicy {
  if (kind !== 'history' && kind !== 'detection') return { ok: false, reason: 'bad-kind' };
  if (state.athleteId === null) return { ok: false, reason: 'not-authenticated' };
  if (kind === 'history' && state.historyLocked) return { ok: false, reason: 'locked' };
  return {
    ok: true,
    pathPrefix: blobPrefix(kind, state.athleteId),
    maximumSizeInBytes: maxUploadBytes(kind),
    allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
  };
}

/**
 * How far back a history import reaches (Mads, 2026-09-25 — amends 03's
 * ballot 4, "store everything"). Garmin's export has no date range, so the
 * athlete uploads all of it and the import drops what is older.
 */
export const HISTORY_WINDOW_WEEKS = 8;

/**
 * Whether an activity on `activityDate` falls in the `weeks` ending `today`:
 * today and the `weeks × 7 − 1` days before it. A date after today is kept —
 * the device clock is the athlete's, and dropping it would lose a session.
 */
export function withinWindow(activityDate: string, today: string, weeks: number): boolean {
  return daysBetween(activityDate, today) < weeks * 7;
}

/** The file types either upload takes: one activity, or a Garmin export zip. */
const UPLOAD_NAME = /^[^/]+\.(fit|gpx|zip)$/i;

/**
 * Whether the token route may issue a token for `pathname`: a `.fit`, `.gpx`
 * or `.zip` named directly under the athlete's prefix, nothing nested and
 * nothing climbing out. The client chooses the pathname, so this is where it
 * stops being a claim.
 */
export function acceptsPathname(prefix: string, pathname: string): boolean {
  if (!pathname.startsWith(prefix)) return false;
  const name = pathname.slice(prefix.length);
  return UPLOAD_NAME.test(name);
}

/** Private Vercel Blob URLs: `https://<store>.private.blob.vercel-storage.com/<pathname>`. */
const PRIVATE_BLOB_HOST = '.private.blob.vercel-storage.com';

/** A single path segment, with no slash or backslash hiding in an escape. */
const ONE_FILE_NAME = /^(?!.*%(2f|5c))[^/\\]+$/i;

/**
 * Whether a blob URL the client handed back is one of this athlete's own
 * private uploads. The server fetches and deletes by URL, so a URL outside the
 * athlete's prefix, on another host, or on a public blob is refused before any
 * of that happens. The path is read after URL resolution, so `..` cannot climb
 * out of the prefix, and what follows the prefix must be one file name — no
 * further segment, and no encoded slash that a store might decode into one.
 */
export function isOwnBlobUrl(url: string, prefix: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const name = parsed.pathname.slice(prefix.length + 1);
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname.endsWith(PRIVATE_BLOB_HOST) &&
    parsed.pathname.startsWith(`/${prefix}`) &&
    ONE_FILE_NAME.test(name)
  );
}

/** One activity file found in an upload, by its own name without folders. */
export type UploadedFile = { name: string; bytes: Uint8Array };

/** What an upload holds: its activity files, and how many archives inside it could not be opened. */
export type ExpandedUpload = { files: UploadedFile[]; failed: number };

const ACTIVITY_FILE = /\.(fit|gpx)$/i;
const ZIP_FILE = /\.zip$/i;

/**
 * Opens one detection upload into its activity files. A `.fit` or `.gpx` is
 * itself; a `.zip` is opened, and so is every zip inside it, but no deeper.
 * Anything that is not a `.fit` or `.gpx` is ignored. An archive that will not
 * open counts once in `failed` and the rest carries on; nothing here throws on
 * a bad file. A detection upload is one activity or a small zip, so it is
 * opened in memory; the history import streams its zips instead
 * (`export-unpacker.ts`).
 */
export function expandUpload(name: string, bytes: Uint8Array): ExpandedUpload {
  if (ACTIVITY_FILE.test(name)) return { files: [{ name, bytes }], failed: 0 };
  if (!ZIP_FILE.test(name)) return { files: [], failed: 0 };
  return openExport(bytes);
}

/** A zip's own activity files, then each nested zip's; an outer zip that will not open is one failure. */
function openExport(bytes: Uint8Array): ExpandedUpload {
  const outer = openZip(bytes, (entry) => ACTIVITY_FILE.test(entry.name) || ZIP_FILE.test(entry.name));
  if (outer === null) return { files: [], failed: 1 };

  const found: ExpandedUpload = { files: activityFiles(outer), failed: 0 };
  for (const [entry, data] of Object.entries(outer)) {
    if (!ZIP_FILE.test(entry)) continue;
    const inner = openZip(data, (file) => ACTIVITY_FILE.test(file.name));
    if (inner === null) found.failed++;
    else found.files.push(...activityFiles(inner));
  }
  return found;
}

/** The activity files of an opened zip, named without their folders. */
function activityFiles(zip: Unzipped): UploadedFile[] {
  return Object.entries(zip)
    .filter(([entry]) => ACTIVITY_FILE.test(entry))
    .map(([entry, data]) => ({ name: entry.slice(entry.lastIndexOf('/') + 1), bytes: data }));
}

/** A zip's entries that `filter` keeps, decompressed; null when it is not a zip that opens. */
function openZip(bytes: Uint8Array, filter: UnzipFileFilter): Unzipped | null {
  try {
    return unzipSync(bytes, { filter });
  } catch {
    return null;
  }
}

/**
 * The most one activity file inside an export may inflate to. A `.fit` is
 * kilobytes and a day of one-second GPX tens of MB; past this it is not an
 * activity, and the unpacker, which holds each file whole, fails it rather
 * than run out of memory on it.
 */
export const MAX_ACTIVITY_BYTES = 64 * 1024 * 1024;

/**
 * How many files one import step reads, and how many extracted files the
 * unpacking saves at a time. Small enough that a step — parse, plan, one
 * batched write — fits well inside a function's time, and a crash costs at
 * most this many files' work.
 */
export const IMPORT_CHUNK_FILES = 25;

/** Where a history import stands, as the worker reads and writes it. */
export type ImportProgress = {
  /** Uploads still to unpack, then the single-file blobs still to import, in order. */
  blobUrls: string[];
  /** Unpacking: entries of the zip at hand already extracted. Importing: files already read. */
  cursor: number;
  total: number;
  done: number;
  skippedOld: number;
  failed: number;
};

/** The first upload still to unpack — a zip — or null once only single files are left. */
export function nextZip(blobUrls: readonly string[]): string | null {
  return blobUrls.find((url) => ZIP_FILE.test(url)) ?? null;
}

/**
 * Where an activity file extracted from an upload is kept until it is
 * imported: a private blob under the import, named by its number. The number
 * is stable for the same zip, so a run that resumes part-way overwrites what an
 * earlier run may have left, never duplicates it. Under the athlete's history
 * prefix, so the bulk remove, erasure and the sweep reach it.
 */
export function extractedPathname(athleteId: string, importId: string, n: number, name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return `${blobPrefix('history', athleteId)}${importId}/${n}.${ext}`;
}

/** What a stretch of unpacking did with the zip at hand. */
export type UnpackOutcome = {
  /** The URLs of the files extracted, in order. */
  extracted: string[];
  /** Entries that failed: an archive that would not open, a file that would not inflate, a zip that is gone. */
  failed: number;
  /** Whether the zip was read to its end. */
  complete: boolean;
};

/**
 * The import after a stretch of unpacking `zipUrl`. Extracted files join the
 * list; every entry read moves the cursor and counts in `total`, a failed one
 * also as done and failed. A zip read to its end leaves the list and is named
 * in `finishedZip`, for the caller to delete. With no zip left the import turns
 * to importing, and `total` settles on what is known then: the files that
 * failed plus every file left to read.
 */
export function advanceUnpack(
  row: ImportProgress,
  zipUrl: string | null,
  outcome: UnpackOutcome,
): ImportProgress & { status: 'unpacking' | 'importing'; finishedZip: string | null } {
  const appended = [...row.blobUrls, ...outcome.extracted];
  const blobUrls = outcome.complete ? appended.filter((url) => url !== zipUrl) : appended;
  const read = outcome.extracted.length + outcome.failed;
  const counts = { done: row.done + outcome.failed, skippedOld: row.skippedOld, failed: row.failed + outcome.failed };
  if (!outcome.complete) {
    return { blobUrls, cursor: row.cursor + read, total: row.total + read, ...counts, status: 'unpacking', finishedZip: null };
  }
  const unpacked = nextZip(blobUrls) === null;
  return {
    blobUrls,
    cursor: 0,
    total: unpacked ? counts.done + blobUrls.length : row.total + read,
    ...counts,
    status: unpacked ? 'importing' : 'unpacking',
    finishedZip: zipUrl,
  };
}

/** What became of the files one import step read. */
export type ImportOutcome = { read: number; failed: number; skippedOld: number };

/**
 * The import after one step over its single-file blobs: the files read leave
 * the list — the caller deletes each once the step is written — and with none
 * left the import is done.
 */
export function advanceImport(row: ImportProgress, outcome: ImportOutcome): ImportProgress & { status: 'importing' | 'done' } {
  const blobUrls = row.blobUrls.slice(outcome.read);
  return {
    blobUrls,
    cursor: row.cursor + outcome.read,
    total: row.total,
    done: row.done + outcome.read,
    skippedOld: row.skippedOld + outcome.skippedOld,
    failed: row.failed + outcome.failed,
    status: blobUrls.length === 0 ? 'done' : 'importing',
  };
}

/** Whether an import is still going — unpacking or importing — so the screen keeps polling. */
export function importRunning(status: string): boolean {
  return status === 'unpacking' || status === 'importing';
}

/** What the athlete's screen is told about an import: counts and status, never the blob URLs. */
export type ImportSummary = { status: string; total: number; done: number; skippedOld: number; failed: number };

export function importSummary(row: ImportSummary & { blobUrls?: unknown }): ImportSummary {
  return { status: row.status, total: row.total, done: row.done, skippedOld: row.skippedOld, failed: row.failed };
}
