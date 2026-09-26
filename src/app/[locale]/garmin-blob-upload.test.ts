import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `garmin-integration/04` — the browser half of an upload: ask where, then send
 * each file straight to Blob. Blob's client and the server action are mocked.
 */
const { upload, prepareGarminUploadAction } = vi.hoisted(() => ({ upload: vi.fn(), prepareGarminUploadAction: vi.fn() }));
vi.mock('@vercel/blob/client', () => ({ upload }));
vi.mock('./garmin-actions', () => ({ prepareGarminUploadAction }));

const { uploadToBlob } = await import('./garmin-blob-upload');

const PREFIX = 'garmin/history/a1/';
const file = (name: string, size: number) => {
  const f = new File([new Uint8Array(Math.min(size, 8))], name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeEach(() => {
  vi.resetAllMocks();
  prepareGarminUploadAction.mockResolvedValue({ ok: true, pathPrefix: PREFIX });
  upload.mockImplementation(async (pathname: string, body: File, options: { onUploadProgress?: (e: { loaded: number }) => void }) => {
    options.onUploadProgress?.({ loaded: body.size });
    return { url: `https://s.private.blob.vercel-storage.com/${pathname}` };
  });
});

describe('uploadToBlob', () => {
  it('sends each file privately under the athlete prefix, through the token route, and returns the URLs', async () => {
    const progress = vi.fn();
    const result = await uploadToBlob('history', [file('export.zip', 300), file('ride.fit', 100)], progress);

    expect(result).toEqual({
      ok: true,
      urls: [`https://s.private.blob.vercel-storage.com/${PREFIX}export.zip`, `https://s.private.blob.vercel-storage.com/${PREFIX}ride.fit`],
    });
    expect(prepareGarminUploadAction).toHaveBeenCalledWith('history');
    expect(upload).toHaveBeenNthCalledWith(1, `${PREFIX}export.zip`, expect.any(File), {
      access: 'private',
      handleUploadUrl: '/api/garmin-upload',
      clientPayload: JSON.stringify({ kind: 'history' }),
      contentType: 'application/zip',
      multipart: false,
      onUploadProgress: expect.any(Function),
    });
    expect(upload.mock.calls[1][2]).toMatchObject({ contentType: 'application/octet-stream' });
    expect(progress.mock.calls).toEqual([[0.75], [1]]);
  });

  it('uploads a large file in parts', async () => {
    await uploadToBlob('history', [file('big.zip', 60 * 1024 * 1024)], vi.fn());
    expect(upload.mock.calls[0][2]).toMatchObject({ multipart: true, clientPayload: JSON.stringify({ kind: 'history' }) });
    await uploadToBlob('detection', [file('edge.zip', 50 * 1024 * 1024)], vi.fn());
    expect(upload.mock.calls[1][2]).toMatchObject({ multipart: false });
  });

  it('refuses a file over 500 MB before asking for anything', async () => {
    expect(await uploadToBlob('history', [file('a.fit', 10), file('huge.zip', 500 * 1024 * 1024 + 1)], vi.fn())).toEqual({ ok: false, reason: 'too-large' });
    expect(await uploadToBlob('history', [file('max.zip', 500 * 1024 * 1024)], vi.fn())).toMatchObject({ ok: true });
    expect(prepareGarminUploadAction).toHaveBeenCalledTimes(1);
  });

  it('refuses a detection file over 50 MB before asking for anything (ruling 6a)', async () => {
    expect(await uploadToBlob('detection', [file('export.zip', 50 * 1024 * 1024 + 1)], vi.fn())).toEqual({ ok: false, reason: 'too-large' });
    expect(prepareGarminUploadAction).not.toHaveBeenCalled();
    expect(await uploadToBlob('detection', [file('max.zip', 50 * 1024 * 1024)], vi.fn())).toMatchObject({ ok: true });
  });

  it('ignores empty files, and is empty when nothing is left', async () => {
    expect(await uploadToBlob('history', [file('a.fit', 0)], vi.fn())).toEqual({ ok: false, reason: 'empty' });
    expect(prepareGarminUploadAction).not.toHaveBeenCalled();
    await uploadToBlob('history', [file('a.fit', 0), file('b.fit', 5)], vi.fn());
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('passes the server’s refusal through and uploads nothing', async () => {
    prepareGarminUploadAction.mockResolvedValue({ ok: false, reason: 'locked' });
    expect(await uploadToBlob('history', [file('a.fit', 5)], vi.fn())).toEqual({ ok: false, reason: 'locked' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('says the upload failed when Blob refuses or the connection drops', async () => {
    upload.mockRejectedValue(new Error('content type not allowed'));
    expect(await uploadToBlob('history', [file('a.fit', 5)], vi.fn())).toEqual({ ok: false, reason: 'upload-failed' });
  });
});
