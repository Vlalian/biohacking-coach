import { upload } from '@vercel/blob/client';
import { contentTypeFor, maxUploadBytes, type UploadKind, type UploadRefusal } from '@/features/garmin/blob-upload';
import { prepareGarminUploadAction } from './garmin-actions';

/**
 * The browser half of a Garmin upload (`garmin-integration/04`): the files go
 * straight to Vercel Blob, private, with a short-lived token from
 * `/api/garmin-upload` — never through a function body, which is capped at
 * 4.5 MB. Only the resulting URLs reach the server actions.
 */
export type BlobUploadResult =
  | { ok: true; urls: string[] }
  | { ok: false; reason: UploadRefusal | 'empty' | 'too-large' | 'upload-failed' };

/** From this size a file goes up in parts, each retried on its own. */
const MULTIPART_FROM_BYTES = 50 * 1024 * 1024;

/**
 * Uploads the files one after another, reporting the fraction of all bytes
 * sent. Empty files are left out; one over the cap stops the upload before
 * anything is sent. Files sent before a failure stay in Blob until the 24 h
 * sweep.
 */
export async function uploadToBlob(
  kind: UploadKind,
  picked: readonly File[],
  onProgress: (fraction: number) => void,
): Promise<BlobUploadResult> {
  const files = picked.filter((f) => f.size > 0);
  if (files.length === 0) return { ok: false, reason: 'empty' };
  if (files.some((f) => f.size > maxUploadBytes(kind))) return { ok: false, reason: 'too-large' };

  const prepared = await prepareGarminUploadAction(kind);
  if (!prepared.ok) return prepared;

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const sent = files.map(() => 0);
  const urls: string[] = [];
  try {
    for (const [i, file] of files.entries()) {
      const blob = await upload(prepared.pathPrefix + file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/garmin-upload',
        clientPayload: JSON.stringify({ kind }),
        contentType: contentTypeFor(file.name),
        multipart: file.size > MULTIPART_FROM_BYTES,
        onUploadProgress: ({ loaded }) => {
          sent[i] = loaded;
          onProgress(sent.reduce((sum, n) => sum + n, 0) / totalBytes);
        },
      });
      urls.push(blob.url);
    }
  } catch {
    return { ok: false, reason: 'upload-failed' };
  }
  return { ok: true, urls };
}
