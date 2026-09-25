import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `garmin-integration/04` — the adapter over Vercel Blob. Blob itself is
 * mocked: no store exists in tests, and no real key is ever used.
 */
const { get, del, list, put, head, BlobNotFoundError } = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
  head: vi.fn(),
  BlobNotFoundError: class BlobNotFoundError extends Error {},
}));
vi.mock('@vercel/blob', () => ({ get, del, list, put, head, BlobNotFoundError }));

const { fetchBlob, openBlob, putBlob, deleteBlob, blobSize, deleteAthleteBlobs, deleteHistoryBlobs, sweepOldBlobs, blobWorkerDeps } = await import('./blob-store');
const { today } = await import('@/lib/date');

const URL1 = 'https://s.private.blob.vercel-storage.com/garmin/history/a1/x.zip';

function streamOf(...chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  del.mockResolvedValue(undefined);
});

describe('fetchBlob', () => {
  it('reads a private blob, uncached, into one array', async () => {
    get.mockResolvedValue({ statusCode: 200, stream: streamOf([1, 2], [3]) });
    expect(await fetchBlob(URL1)).toEqual(new Uint8Array([1, 2, 3]));
    expect(get).toHaveBeenCalledWith(URL1, { access: 'private', useCache: false });
  });

  it('is null when the blob is gone', async () => {
    get.mockResolvedValue(null);
    expect(await fetchBlob(URL1)).toBeNull();
  });

  it('is null when Blob answers without a body', async () => {
    get.mockResolvedValue({ statusCode: 304, stream: null });
    expect(await fetchBlob(URL1)).toBeNull();
  });
});

describe('openBlob', () => {
  it('hands on the download as it arrives, uncached, without reading it first', async () => {
    const stream = streamOf([1, 2], [3]);
    get.mockResolvedValue({ statusCode: 200, stream });
    expect(await openBlob(URL1)).toBe(stream);
    expect(get).toHaveBeenCalledWith(URL1, { access: 'private', useCache: false });
  });

  it('is null when the blob is gone, or Blob answers without a body', async () => {
    get.mockResolvedValueOnce(null).mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await openBlob(URL1)).toBeNull();
    expect(await openBlob(URL1)).toBeNull();
  });
});

describe('putBlob', () => {
  it('stores one file as a private blob at exactly that path, overwriting a copy an earlier run left', async () => {
    put.mockResolvedValue({ url: 'https://s.private.blob.vercel-storage.com/garmin/history/a1/imp1/0.fit' });
    const bytes = new Uint8Array([9, 8, 7, 6]).subarray(1, 3);

    expect(await putBlob('garmin/history/a1/imp1/0.fit', bytes)).toBe('https://s.private.blob.vercel-storage.com/garmin/history/a1/imp1/0.fit');

    const [pathname, body, options] = put.mock.calls[0];
    expect(pathname).toBe('garmin/history/a1/imp1/0.fit');
    expect([...body]).toEqual([8, 7]);
    expect(options).toEqual({ access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/octet-stream' });
  });
});

describe('deleteBlob', () => {
  it('deletes by URL', async () => {
    await deleteBlob(URL1);
    expect(del).toHaveBeenCalledWith(URL1);
  });
});

describe('blobSize', () => {
  it('reads the size from the blob’s metadata, downloading nothing', async () => {
    head.mockResolvedValue({ size: 1234 });
    expect(await blobSize(URL1)).toBe(1234);
    expect(head).toHaveBeenCalledWith(URL1);
    expect(get).not.toHaveBeenCalled();
  });

  it('is null for a blob that is gone', async () => {
    head.mockRejectedValue(new BlobNotFoundError('gone'));
    expect(await blobSize(URL1)).toBeNull();
  });

  it('lets any other failure through', async () => {
    head.mockRejectedValue(new Error('blob down'));
    await expect(blobSize(URL1)).rejects.toThrow('blob down');
  });
});

describe('deleteHistoryBlobs', () => {
  it('deletes the athlete’s history uploads, and only those', async () => {
    list.mockResolvedValue({ blobs: [{ url: 'u1' }], hasMore: false });
    await deleteHistoryBlobs('a1');
    expect(list).toHaveBeenCalledWith({ prefix: 'garmin/history/a1/', cursor: undefined });
    expect(del.mock.calls).toEqual([[['u1']]]);
  });
});

describe('deleteAthleteBlobs', () => {
  it('deletes every blob under the athlete’s prefix for that kind, page by page', async () => {
    list
      .mockResolvedValueOnce({ blobs: [{ url: 'u1' }, { url: 'u2' }], hasMore: true, cursor: 'c1' })
      .mockResolvedValueOnce({ blobs: [{ url: 'u3' }], hasMore: false });
    await deleteAthleteBlobs('a1', 'history');
    expect(list).toHaveBeenNthCalledWith(1, { prefix: 'garmin/history/a1/', cursor: undefined });
    expect(list).toHaveBeenNthCalledWith(2, { prefix: 'garmin/history/a1/', cursor: 'c1' });
    expect(del.mock.calls).toEqual([[['u1', 'u2']], [['u3']]]);
  });

  it('calls delete for nothing when nothing is there', async () => {
    list.mockResolvedValue({ blobs: [], hasMore: false });
    await deleteAthleteBlobs('a1', 'detection');
    expect(list).toHaveBeenCalledWith({ prefix: 'garmin/detection/a1/', cursor: undefined });
    expect(del).not.toHaveBeenCalled();
  });
});

describe('sweepOldBlobs', () => {
  const NOW = new Date('2026-09-25T12:00:00Z');
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

  it('deletes Garmin uploads older than 24 h and keeps the rest, across pages', async () => {
    list
      .mockResolvedValueOnce({
        blobs: [
          { url: 'old', uploadedAt: hoursAgo(25) },
          { url: 'fresh', uploadedAt: hoursAgo(23) },
        ],
        hasMore: true,
        cursor: 'c1',
      })
      .mockResolvedValueOnce({ blobs: [{ url: 'edge', uploadedAt: hoursAgo(24) }], hasMore: false });

    expect(await sweepOldBlobs(NOW)).toBe(1);
    expect(list).toHaveBeenNthCalledWith(1, { prefix: 'garmin/', cursor: undefined });
    expect(list).toHaveBeenNthCalledWith(2, { prefix: 'garmin/', cursor: 'c1' });
    expect(del.mock.calls).toEqual([[['old']]]);
  });
});

describe('blobWorkerDeps', () => {
  it('is this adapter and the app clock, as the import worker wants them', () => {
    expect(blobWorkerDeps).toEqual({ fetchBlob, openBlob, putBlob, deleteBlob, deleteHistoryBlobs, today });
  });
});
