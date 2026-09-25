import { describe, it, expect, vi, beforeEach } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { buildFitFile, buildGpxFile } from './fit-fixture';
import type { ParsedSession } from './garmin';

/**
 * `garmin-integration/04` — the background import. The database side (the
 * service) and Blob (the injected deps) are the boundaries and are faked; the
 * zips are real, streamed in small chunks the way a download arrives, and the
 * files are real synthetic FIT/GPX, parsed by the real parser.
 */
type Row = {
  id: string;
  athleteId: string;
  status: string;
  blobUrls: string[];
  cursor: number;
  total: number;
  done: number;
  skippedOld: number;
  failed: number;
};

const { getHistoryImport, importTrainingHistory, importProgressWrite, importsToResume } = vi.hoisted(() => ({
  getHistoryImport: vi.fn(),
  importTrainingHistory: vi.fn(),
  importProgressWrite: vi.fn(),
  importsToResume: vi.fn(),
}));
vi.mock('./history-import-service', () => ({ getHistoryImport, importTrainingHistory, importProgressWrite, importsToResume }));

const { importNextChunk, runHistoryImport, resumeImports, timeBudget, IMPORT_TIME_BUDGET_MS } = await import('./history-import-worker');

const TODAY = '2026-09-25';
const HOST = 'https://s.private.blob.vercel-storage.com/';
const ZIP_URL = `${HOST}garmin/history/a1/export-Ab1.zip`;
const ZIP_URL_2 = `${HOST}garmin/history/a1/second-Ef3.zip`;
const FIT_URL = `${HOST}garmin/history/a1/ride-Cd2.fit`;
const extracted = (n: number, ext = 'fit') => `${HOST}garmin/history/a1/imp1/${n}.${ext}`;

const fitOn = (day: string, minute = 0) =>
  new Uint8Array(buildFitFile({ start: new Date(`${day}T06:${String(minute).padStart(2, '0')}:00Z`) }));
const gpxOn = (day: string) => strToU8(buildGpxFile({ start: new Date(`${day}T07:00:00Z`) }));

/** A zip of `count` recent activity files. */
const zipOf = (count: number) => zipSync(Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}.fit`, fitOn('2026-09-20', i)])));

/** A run with all the time in the world. */
const never = () => false;

/** The row as the fake database holds it; every progress write lands here. */
let row: Row;

function startRow(over: Partial<Row> = {}): Row {
  return { id: 'imp1', athleteId: 'a1', status: 'unpacking', blobUrls: [ZIP_URL], cursor: 0, total: 0, done: 0, skippedOld: 0, failed: 0, ...over };
}

/** Every activity each step handed to the history writer. */
function writtenHistory(): ParsedSession[] {
  return importTrainingHistory.mock.calls.flatMap((call) => call[1] as ParsedSession[]);
}

/** The bytes as a download: a pull stream of small chunks. */
function download(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(at, at + 512));
      at += 512;
    },
  });
}

/** A fake Blob store: what is in it, by URL, and every call made to it. */
function deps(initial: Record<string, Uint8Array>) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    fetchBlob: vi.fn(async (url: string) => store.get(url) ?? null),
    openBlob: vi.fn(async (url: string) => {
      const bytes = store.get(url);
      return bytes ? download(bytes) : null;
    }),
    putBlob: vi.fn(async (pathname: string, bytes: Uint8Array) => {
      store.set(`${HOST}${pathname}`, bytes);
      return `${HOST}${pathname}`;
    }),
    deleteBlob: vi.fn(async (url: string) => {
      store.delete(url);
    }),
    today: () => TODAY,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  row = startRow();
  getHistoryImport.mockImplementation(async (id: string) => (id === row.id ? { ...row } : undefined));
  importProgressWrite.mockImplementation((id: string, readAt: { status: string; cursor: number }, next: Partial<Row>) => ({ id, readAt, next }));
  importTrainingHistory.mockImplementation(async (_a: string, parsed: unknown[], progress: { readAt: { status: string; cursor: number }; next: Partial<Row> }) => {
    // The write is conditional on where the import was read, as the real one is.
    if (progress.readAt.status === row.status && progress.readAt.cursor === row.cursor) row = { ...row, ...progress.next };
    return { imported: parsed.length, proposed: 0 };
  });
});

describe('importNextChunk — unpacking', () => {
  it('turns every .fit and .gpx of the export, a zip deep included, into its own blob, and deletes the zip', async () => {
    const part = zipSync({ 'b.fit': fitOn('2026-09-21'), 'notes.txt': strToU8('x') });
    const exported = zipSync({ 'a.gpx': gpxOn('2026-09-20'), 'DI_CONNECT/summary.json': strToU8('{}'), 'DI_CONNECT/UploadedFiles_Part1.zip': part });
    const d = deps({ [ZIP_URL]: exported });

    expect(await importNextChunk('imp1', d, never)).toBe('importing');

    expect(d.putBlob.mock.calls.map(([pathname]) => pathname)).toEqual(['garmin/history/a1/imp1/0.gpx', 'garmin/history/a1/imp1/1.fit']);
    expect(d.store.get(extracted(1))).toEqual(fitOn('2026-09-21'));
    expect(row).toMatchObject({ status: 'importing', blobUrls: [extracted(0, 'gpx'), extracted(1)], cursor: 0, total: 2, done: 0, failed: 0 });
    expect(d.deleteBlob.mock.calls).toEqual([[ZIP_URL]]);
    expect(d.openBlob).toHaveBeenCalledWith(ZIP_URL);
    expect(d.fetchBlob).not.toHaveBeenCalled();
    expect(writtenHistory()).toEqual([]);
  });

  it('saves its place every 25 entries, failed ones included, each save conditional on the last', async () => {
    const files = Object.fromEntries(Array.from({ length: 29 }, (_, i) => [`f${i}.fit`, fitOn('2026-09-20', i)]));
    const d = deps({ [ZIP_URL]: zipSync({ 'broken.zip': strToU8('not a zip'), ...files }) });
    await importNextChunk('imp1', d, never);
    expect(importProgressWrite.mock.calls.map(([, readAt, next]) => [readAt, next.cursor, next.blobUrls.length])).toEqual([
      [{ status: 'unpacking', cursor: 0 }, 25, 25],
      [{ status: 'unpacking', cursor: 25 }, 0, 29],
    ]);
    expect(d.putBlob.mock.calls[0][0]).toBe('garmin/history/a1/imp1/1.fit');
    expect(importProgressWrite).toHaveBeenCalledWith('imp1', expect.anything(), expect.not.objectContaining({ finishedZip: expect.anything() }));
    expect(row).toMatchObject({ status: 'importing', total: 30, failed: 1, done: 1 });
  });

  it('stops when time is up and a later run carries on at the next entry, with no file twice', async () => {
    const d = deps({ [ZIP_URL]: zipOf(30) });

    expect(await importNextChunk('imp1', d, () => d.putBlob.mock.calls.length >= 5)).toBe('unpacking');
    const stoppedAt = row.cursor;
    expect(stoppedAt).toBeGreaterThanOrEqual(5);
    expect(stoppedAt).toBeLessThan(30);
    expect(row).toMatchObject({ status: 'unpacking', total: stoppedAt, blobUrls: [ZIP_URL, ...Array.from({ length: stoppedAt }, (_, n) => extracted(n))] });
    expect(d.deleteBlob).not.toHaveBeenCalled();

    expect(await importNextChunk('imp1', d, never)).toBe('importing');
    expect(row.blobUrls).toEqual(Array.from({ length: 30 }, (_, n) => extracted(n)));
    expect(d.putBlob).toHaveBeenCalledTimes(30);
    expect(row).toMatchObject({ total: 30, cursor: 0 });
    expect(d.deleteBlob.mock.calls).toEqual([[ZIP_URL]]);
  });

  it('after a crash, extracts again only what was not saved, overwriting the same paths', async () => {
    const d = deps({ [ZIP_URL]: zipOf(30) });
    const put = d.putBlob.getMockImplementation()!;
    d.putBlob.mockImplementation(async (pathname, bytes) => {
      if (d.putBlob.mock.calls.length === 28) throw new Error('blob down');
      return put(pathname, bytes);
    });

    await expect(importNextChunk('imp1', d, never)).rejects.toThrow('blob down');
    expect(row).toMatchObject({ status: 'unpacking', cursor: 25 });

    d.putBlob.mockImplementation(put);
    await importNextChunk('imp1', d, never);
    expect(d.putBlob.mock.calls.slice(28).map(([pathname]) => pathname)).toEqual(
      [25, 26, 27, 28, 29].map((n) => `garmin/history/a1/imp1/${n}.fit`),
    );
    expect(row.blobUrls).toEqual(Array.from({ length: 30 }, (_, n) => extracted(n)));
  });

  it('numbers a second zip’s files after the first’s, and keeps a plain upload as it is', async () => {
    row = startRow({ blobUrls: [ZIP_URL, FIT_URL, ZIP_URL_2] });
    const d = deps({ [ZIP_URL]: zipOf(2), [ZIP_URL_2]: zipOf(3), [FIT_URL]: fitOn('2026-09-22') });

    expect(await importNextChunk('imp1', d, never)).toBe('unpacking');
    expect(row).toMatchObject({ blobUrls: [FIT_URL, ZIP_URL_2, extracted(0), extracted(1)], total: 2 });

    expect(await importNextChunk('imp1', d, never)).toBe('importing');
    expect(row).toMatchObject({ blobUrls: [FIT_URL, extracted(0), extracted(1), extracted(2), extracted(3), extracted(4)], total: 6 });
    expect(d.deleteBlob.mock.calls).toEqual([[ZIP_URL], [ZIP_URL_2]]);
  });

  it('counts an archive that will not open, or a zip that is gone, as one failed file', async () => {
    row = startRow({ blobUrls: [ZIP_URL, ZIP_URL_2] });
    const d = deps({ [ZIP_URL]: strToU8('not a zip at all') });
    await importNextChunk('imp1', d, never);
    await importNextChunk('imp1', d, never);
    expect(row).toMatchObject({ status: 'importing', blobUrls: [], total: 2, done: 2, failed: 2 });
    expect(d.putBlob).not.toHaveBeenCalled();
  });

  it('goes straight to importing when the upload held no zip', async () => {
    row = startRow({ blobUrls: [FIT_URL] });
    const d = deps({ [FIT_URL]: fitOn('2026-09-22') });
    expect(await importNextChunk('imp1', d, never)).toBe('importing');
    expect(row).toMatchObject({ status: 'importing', blobUrls: [FIT_URL], total: 1 });
    expect(d.openBlob).not.toHaveBeenCalled();
    expect(d.deleteBlob).not.toHaveBeenCalled();
  });

  it('keeps going when the finished zip cannot be deleted — the sweep will', async () => {
    const d = deps({ [ZIP_URL]: zipOf(1) });
    d.deleteBlob.mockRejectedValue(new Error('blob down'));
    expect(await importNextChunk('imp1', d, never)).toBe('importing');
  });
});

describe('importNextChunk — importing', () => {
  it('writes recent activities with streams, counts the old ones, and deletes each file once written', async () => {
    const d = deps({ [extracted(0)]: fitOn('2026-09-15'), [extracted(1)]: fitOn('2026-07-17') });
    row = startRow({ status: 'importing', blobUrls: [extracted(0), extracted(1)], total: 2 });

    expect(await importNextChunk('imp1', d, never)).toBe('done');

    expect(writtenHistory()).toHaveLength(1);
    expect(writtenHistory()[0]).toMatchObject({ date: '2026-09-15', streams: expect.objectContaining({ t: expect.any(Array) }) });
    expect(importTrainingHistory).toHaveBeenCalledWith('a1', expect.any(Array), expect.anything());
    expect(row).toMatchObject({ done: 2, total: 2, skippedOld: 1, failed: 0, status: 'done', blobUrls: [] });
    expect(importProgressWrite).toHaveBeenCalledWith('imp1', { status: 'importing', cursor: 0 }, expect.objectContaining({ cursor: 2 }));
    expect(d.deleteBlob.mock.calls).toEqual([[extracted(0)], [extracted(1)]]);
    const written = importTrainingHistory.mock.invocationCallOrder[0];
    expect(d.deleteBlob.mock.invocationCallOrder.every((order) => order > written)).toBe(true);
  });

  it('counts a corrupt file as failed and carries on', async () => {
    const d = deps({ [extracted(0)]: strToU8('not a fit file at all'), [extracted(1, 'gpx')]: gpxOn('2026-09-20') });
    row = startRow({ status: 'importing', blobUrls: [extracted(0), extracted(1, 'gpx')], total: 2 });
    await importNextChunk('imp1', d, never);
    expect(row).toMatchObject({ failed: 1, done: 2, status: 'done' });
    expect(writtenHistory().map((a) => a.date)).toEqual(['2026-09-20']);
  });

  it('counts a file that is gone as failed', async () => {
    row = startRow({ status: 'importing', blobUrls: [extracted(0)], total: 1 });
    expect(await importNextChunk('imp1', deps({}), never)).toBe('done');
    expect(row).toMatchObject({ failed: 1, done: 1, total: 1, blobUrls: [] });
    expect(writtenHistory()).toEqual([]);
  });

  it('reads at most 25 files per call and stays importing until the rest is done', async () => {
    const urls = Array.from({ length: 30 }, (_, n) => extracted(n));
    const d = deps(Object.fromEntries(urls.map((url, n) => [url, fitOn('2026-09-20', n)])));
    row = startRow({ status: 'importing', blobUrls: urls, total: 30 });

    expect(await importNextChunk('imp1', d, never)).toBe('importing');
    expect(writtenHistory()).toHaveLength(25);
    expect(row).toMatchObject({ cursor: 25, done: 25, total: 30, status: 'importing', blobUrls: urls.slice(25) });
    expect(d.deleteBlob).toHaveBeenCalledTimes(25);

    expect(await importNextChunk('imp1', d, never)).toBe('done');
    expect(writtenHistory()).toHaveLength(30);
    expect(importProgressWrite).toHaveBeenLastCalledWith('imp1', { status: 'importing', cursor: 25 }, expect.objectContaining({ done: 30, status: 'done' }));
    expect(d.deleteBlob).toHaveBeenCalledTimes(30);
  });

  it('finishes an import with no file left, reading nothing', async () => {
    row = startRow({ status: 'importing', blobUrls: [] });
    const d = deps({});
    expect(await importNextChunk('imp1', d, never)).toBe('done');
    expect(d.fetchBlob).not.toHaveBeenCalled();
    expect(importTrainingHistory).toHaveBeenCalledWith('a1', [], expect.anything());
    expect(row).toMatchObject({ status: 'done', total: 0, done: 0, failed: 0 });
  });

  it('keeps going when a file cannot be deleted — the sweep will', async () => {
    row = startRow({ status: 'importing', blobUrls: [extracted(0)], total: 1 });
    const d = deps({ [extracted(0)]: fitOn('2026-09-20') });
    d.deleteBlob.mockRejectedValue(new Error('blob down'));
    expect(await importNextChunk('imp1', d, never)).toBe('done');
  });
});

describe('importNextChunk — stopped', () => {
  it('does nothing for an import that is gone or already finished', async () => {
    const d = deps({ [ZIP_URL]: zipOf(1) });
    expect(await importNextChunk('nope', d, never)).toBe('stopped');
    row = startRow({ status: 'done' });
    expect(await importNextChunk('imp1', d, never)).toBe('stopped');
    expect(d.openBlob).not.toHaveBeenCalled();
    expect(d.fetchBlob).not.toHaveBeenCalled();
    expect(importTrainingHistory).not.toHaveBeenCalled();
  });
});

describe('runHistoryImport', () => {
  it('unpacks, then imports step after step until the import is done, leaving no blob behind', async () => {
    const d = deps({ [ZIP_URL]: zipOf(60) });
    await runHistoryImport('imp1', d, () => false);
    expect(row).toMatchObject({ status: 'done', done: 60, total: 60 });
    expect(d.openBlob).toHaveBeenCalledTimes(1);
    expect(writtenHistory()).toHaveLength(60);
    expect(d.store.size).toBe(0);
  });

  it('carries on from one zip to the next within a run', async () => {
    row = startRow({ blobUrls: [ZIP_URL, ZIP_URL_2] });
    const d = deps({ [ZIP_URL]: zipOf(2), [ZIP_URL_2]: zipOf(3) });
    await runHistoryImport('imp1', d, never);
    expect(row).toMatchObject({ status: 'done', done: 5, total: 5 });
  });

  it('stops when time is up and leaves the rest to the cron', async () => {
    const d = deps({ [ZIP_URL]: zipOf(3) });
    let checks = 0;
    await runHistoryImport('imp1', d, () => ++checks > 1);
    expect(row).toMatchObject({ status: 'unpacking' });
    expect(d.putBlob).not.toHaveBeenCalled();
  });

  it('stops on an error without throwing, leaving the import for the cron', async () => {
    row = startRow({ status: 'importing', blobUrls: [extracted(0)], total: 1 });
    const d = deps({ [extracted(0)]: fitOn('2026-09-20') });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    importTrainingHistory.mockRejectedValue(new Error('db down'));
    await expect(runHistoryImport('imp1', d, () => false)).resolves.toBeUndefined();
    expect(row.status).toBe('importing');
    expect(errors).toHaveBeenCalledWith('history import stopped', 'imp1');
    errors.mockRestore();
  });
});

describe('resumeImports', () => {
  it('runs each import no one has touched for a minute, while time allows', async () => {
    const now = new Date('2026-09-25T12:00:00Z');
    importsToResume.mockResolvedValue(['imp1', 'imp2']);
    row = startRow({ blobUrls: [FIT_URL] });
    const d = deps({ [FIT_URL]: fitOn('2026-09-20') });
    let checks = 0;

    expect(await resumeImports(d, now, () => ++checks > 3)).toBe(1);

    expect(importsToResume).toHaveBeenCalledWith(new Date('2026-09-25T11:59:00Z'), 5);
    expect(row.status).toBe('done');
  });
});

describe('timeBudget', () => {
  it('is up once the budget has passed, and not before', () => {
    vi.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z') });
    const timeUp = timeBudget(1000);
    vi.advanceTimersByTime(999);
    expect(timeUp()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(timeUp()).toBe(true);
    vi.useRealTimers();
  });

  it('leaves ten seconds of a minute for the write that is in flight', () => {
    expect(IMPORT_TIME_BUDGET_MS).toBe(50_000);
  });
});
