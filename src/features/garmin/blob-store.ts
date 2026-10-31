import 'server-only';

import { BlobNotFoundError, del, get, head, list, put } from '@vercel/blob';
import { today } from '@/lib/date';
import { BLOB_MAX_AGE_MS, GARMIN_BLOB_ROOT, blobPrefix, type UploadKind } from './blob-upload';
import { requestNextImportRun } from './import-chain';

/**
 * The Garmin uploads' side of Vercel Blob (`garmin-integration/04`) — a thin
 * adapter, every rule it applies decided in `blob-upload.ts`.
 *
 * Every upload is private: it is read here with the store's read-write token
 * (`BLOB_READ_WRITE_TOKEN`, set by connecting the store to the project) and
 * never through a public URL. Raw files are not kept: each is deleted once its
 * import is read, and {@link sweepOldBlobs} removes anything left after a day.
 * Nothing here logs a URL or a file's contents.
 */

/** A private blob's bytes, or null when it is gone. */
export async function fetchBlob(url: string): Promise<Uint8Array | null> {
  const stream = await openBlob(url);
  return stream && new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A private blob as it downloads, or null when it is gone. The body is the
 * fetch's own pull stream, so a reader that is slow to take the next chunk
 * slows the download instead of piling it up in memory — how a 500 MB export
 * is unpacked in tens of MB.
 */
export async function openBlob(url: string): Promise<ReadableStream<Uint8Array> | null> {
  const blob = await get(url, { access: 'private', useCache: false });
  return blob?.stream ?? null;
}

/**
 * A blob's size from its metadata, downloading nothing, or null when it is
 * gone — how the detection action refuses a file over its cap before reading it.
 */
export async function blobSize(url: string): Promise<number | null> {
  try {
    return (await head(url)).size;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

/**
 * Stores one file as a private blob at exactly `pathname` and returns its URL.
 * No random suffix and overwrite allowed, so a run that repeats an extraction
 * replaces the earlier copy instead of leaving a second one.
 */
export async function putBlob(pathname: string, bytes: Uint8Array): Promise<string> {
  const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blob = await put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/octet-stream',
  });
  return blob.url;
}

export async function deleteBlob(url: string): Promise<void> {
  await del(url);
}

/** Deletes every upload of this kind the athlete has in Blob — the bulk remove and erasure. */
export async function deleteAthleteBlobs(athleteId: string, kind: UploadKind): Promise<void> {
  await forEachPage(blobPrefix(kind, athleteId), (blobs) => blobs.map((b) => b.url));
}

/** Every history upload the athlete has left — what the worker deletes for an import it failed. */
export async function deleteHistoryBlobs(athleteId: string): Promise<void> {
  await deleteAthleteBlobs(athleteId, 'history');
}

/**
 * Deletes every Garmin upload older than a day, read or not, so a failed or
 * abandoned import never leaves files behind. Returns how many went.
 *
 * Reads `listed` when the caller already has every Garmin upload in hand — the
 * cron lists once and sweeps from the same listing (`garmin-integration/09`) —
 * and lists them itself otherwise.
 */
export async function sweepOldBlobs(now: Date, listed?: readonly ListedBlob[]): Promise<number> {
  const cutoff = now.getTime() - BLOB_MAX_AGE_MS;
  const old = (listed ?? (await listGarminBlobs())).filter((b) => b.uploadedAt.getTime() < cutoff).map((b) => b.url);
  for (let at = 0; at < old.length; at += LIST_PAGE_SIZE) await del(old.slice(at, at + LIST_PAGE_SIZE));
  return old.length;
}

/**
 * Every Garmin upload in Blob, every page of it. Lists only — the cron's first
 * call, which decides whether there is anything for the database to do.
 */
export async function listGarminBlobs(): Promise<ListedBlob[]> {
  const blobs: ListedBlob[] = [];
  await forEachPage(GARMIN_BLOB_ROOT, (page) => {
    blobs.push(...page);
    return [];
  });
  return blobs;
}

export type ListedBlob = { url: string; uploadedAt: Date };

/** What one `list()` page holds at most, and so the most one `del()` is given here. */
const LIST_PAGE_SIZE = 1000;

/** Walks every page under `prefix`, deleting the URLs `pick` returns from each. */
async function forEachPage(prefix: string, pick: (blobs: ListedBlob[]) => string[]): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor });
    const doomed = pick(page.blobs);
    if (doomed.length > 0) await del(doomed);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

/** The import worker's deps as production wires them: this adapter, the chained run, and the app clock. */
export const blobWorkerDeps = { fetchBlob, openBlob, putBlob, deleteBlob, deleteHistoryBlobs, requestNextRun: requestNextImportRun, today };
