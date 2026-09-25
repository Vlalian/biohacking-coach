import 'server-only';

import { del, get, list } from '@vercel/blob';
import { today } from '@/lib/date';
import { BLOB_MAX_AGE_MS, GARMIN_BLOB_ROOT, blobPrefix, type UploadKind } from './blob-upload';

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
  const blob = await get(url, { access: 'private', useCache: false });
  if (!blob?.stream) return null;
  return new Uint8Array(await new Response(blob.stream).arrayBuffer());
}

export async function deleteBlob(url: string): Promise<void> {
  await del(url);
}

/** Deletes every upload of this kind the athlete has in Blob — the bulk remove and erasure. */
export async function deleteAthleteBlobs(athleteId: string, kind: UploadKind): Promise<void> {
  await forEachPage(blobPrefix(kind, athleteId), (blobs) => blobs.map((b) => b.url));
}

/**
 * Deletes every Garmin upload older than a day, read or not, so a failed or
 * abandoned import never leaves files behind. Returns how many went.
 */
export async function sweepOldBlobs(now: Date): Promise<number> {
  const cutoff = now.getTime() - BLOB_MAX_AGE_MS;
  let swept = 0;
  await forEachPage(GARMIN_BLOB_ROOT, (blobs) => {
    const old = blobs.filter((b) => b.uploadedAt.getTime() < cutoff).map((b) => b.url);
    swept += old.length;
    return old;
  });
  return swept;
}

type ListedBlob = { url: string; uploadedAt: Date };

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

/** The import worker's deps as production wires them: this adapter and the app clock. */
export const blobWorkerDeps = { fetchBlob, deleteBlob, today };
