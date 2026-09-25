import { describe, it, expect, vi, beforeEach } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { buildFitFile, buildGpxFile } from './fit-fixture';
import type { ParsedSession } from './garmin';

/**
 * `garmin-integration/04` — the background import. The database side (the
 * service) and Blob (the injected deps) are the boundaries and are faked; the
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
const BLOB_URL = 'https://s.private.blob.vercel-storage.com/garmin/history/a1/export-Ab1.zip';
const BLOB_URL_2 = 'https://s.private.blob.vercel-storage.com/garmin/history/a1/ride-Cd2.fit';

const fitOn = (day: string, minute = 0) =>
  new Uint8Array(buildFitFile({ start: new Date(`${day}T06:${String(minute).padStart(2, '0')}:00Z`) }));

/** The row as the fake database holds it; every progress write lands here. */
let row: Row;

function startRow(over: Partial<Row> = {}): Row {
  return { id: 'imp1', athleteId: 'a1', status: 'importing', blobUrls: [BLOB_URL], cursor: 0, total: 0, done: 0, skippedOld: 0, failed: 0, ...over };
}

/** Every activity each chunk handed to the history writer. */
function writtenHistory(): ParsedSession[] {
  return importTrainingHistory.mock.calls.flatMap((call) => call[1] as ParsedSession[]);
}

function deps(blobs: Record<string, Uint8Array | null>) {
  return {
    fetchBlob: vi.fn(async (url: string) => blobs[url] ?? null),
    deleteBlob: vi.fn(async (_url: string) => {}),
    today: () => TODAY,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  row = startRow();
  getHistoryImport.mockImplementation(async (id: string) => (id === row.id ? { ...row } : undefined));
  importProgressWrite.mockImplementation((id: string, cursor: number, next: Partial<Row>) => ({ id, cursor, next }));
  importTrainingHistory.mockImplementation(async (_a: string, parsed: unknown[], progress: { next: Partial<Row> }) => {
    row = { ...row, ...progress.next };
    return { imported: parsed.length, proposed: 0 };
  });
});

describe('importNextChunk', () => {
  it('writes recent activities with streams, counts the old ones, and deletes the blob when done', async () => {
    const zipOfTwoFits = zipSync({ 'recent.fit': fitOn('2026-09-15'), 'old.fit': fitOn('2026-07-17') });
    const d = deps({ [BLOB_URL]: zipOfTwoFits });

    expect(await importNextChunk('imp1', d)).toBe('done');

    expect(writtenHistory()).toHaveLength(1);
    expect(writtenHistory()[0]).toMatchObject({ date: '2026-09-15', streams: expect.objectContaining({ t: expect.any(Array) }) });
    expect(importTrainingHistory).toHaveBeenCalledWith('a1', expect.any(Array), expect.anything());
    expect(row).toMatchObject({ done: 2, total: 2, skippedOld: 1, failed: 0, status: 'done', blobUrls: [], cursor: 0 });
    expect(importProgressWrite).toHaveBeenCalledWith('imp1', 0, expect.not.objectContaining({ finishedBlob: expect.anything() }));
    expect(d.deleteBlob).toHaveBeenCalledWith(BLOB_URL);
    expect(d.fetchBlob).toHaveBeenCalledWith(BLOB_URL);
  });

  it('counts a corrupt file as failed and carries on', async () => {
    const zip = zipSync({ 'bad.fit': strToU8('not a fit file at all'), 'good.gpx': strToU8(buildGpxFile({ start: new Date('2026-09-20T07:00:00Z') })) });
    await importNextChunk('imp1', deps({ [BLOB_URL]: zip }));
    expect(row).toMatchObject({ failed: 1, done: 2, status: 'done' });
    expect(writtenHistory().map((a) => a.date)).toEqual(['2026-09-20']);
  });

  it('processes at most 25 files per call and stays importing until the rest is done', async () => {
    const files = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}.fit`, fitOn('2026-09-20', i)]));
    const d = deps({ [BLOB_URL]: zipSync(files) });

    expect(await importNextChunk('imp1', d)).toBe('importing');
    expect(writtenHistory()).toHaveLength(25);
    expect(row).toMatchObject({ cursor: 25, done: 25, total: 30, status: 'importing', blobUrls: [BLOB_URL] });
    expect(d.deleteBlob).not.toHaveBeenCalled();

    expect(await importNextChunk('imp1', d)).toBe('done');
    expect(writtenHistory()).toHaveLength(30);
    expect(importProgressWrite).toHaveBeenLastCalledWith('imp1', 25, expect.objectContaining({ done: 30, status: 'done' }));
    expect(d.deleteBlob).toHaveBeenCalledWith(BLOB_URL);
  });

  it('reads the blobs in turn, a plain .fit as one file', async () => {
    row = startRow({ blobUrls: [BLOB_URL, BLOB_URL_2] });
    const d = deps({ [BLOB_URL]: zipSync({ 'a.fit': fitOn('2026-09-20') }), [BLOB_URL_2]: fitOn('2026-09-21') });
    expect(await importNextChunk('imp1', d)).toBe('importing');
    expect(row.blobUrls).toEqual([BLOB_URL_2]);
    expect(await importNextChunk('imp1', d)).toBe('done');
    expect(writtenHistory().map((a) => a.date)).toEqual(['2026-09-20', '2026-09-21']);
    expect(d.deleteBlob.mock.calls).toEqual([[BLOB_URL], [BLOB_URL_2]]);
  });

  it('counts a blob that is gone as one failed file and moves on', async () => {
    const d = deps({});
    expect(await importNextChunk('imp1', d)).toBe('done');
    expect(row).toMatchObject({ failed: 1, done: 1, total: 1, blobUrls: [] });
    expect(writtenHistory()).toEqual([]);
  });

  it('counts a single .fit that is gone as one failed file', async () => {
    row = startRow({ blobUrls: [BLOB_URL_2] });
    expect(await importNextChunk('imp1', deps({}))).toBe('done');
    expect(row).toMatchObject({ failed: 1, done: 1, total: 1, blobUrls: [] });
  });

  it('finishes an import with no blob left, reading nothing', async () => {
    row = startRow({ blobUrls: [] });
    const d = deps({});
    expect(await importNextChunk('imp1', d)).toBe('done');
    expect(d.fetchBlob).not.toHaveBeenCalled();
    expect(importTrainingHistory).toHaveBeenCalledWith('a1', [], expect.anything());
    expect(row).toMatchObject({ status: 'done', total: 0, done: 0, failed: 0 });
    expect(d.deleteBlob).not.toHaveBeenCalled();
  });

  it('does nothing for an import that is gone or already finished', async () => {
    const d = deps({ [BLOB_URL]: fitOn('2026-09-20') });
    expect(await importNextChunk('nope', d)).toBe('stopped');
    row = startRow({ status: 'done' });
    expect(await importNextChunk('imp1', d)).toBe('stopped');
    expect(d.fetchBlob).not.toHaveBeenCalled();
    expect(importTrainingHistory).not.toHaveBeenCalled();
  });

  it('keeps going when a finished blob cannot be deleted — the sweep will', async () => {
    const d = deps({ [BLOB_URL]: fitOn('2026-09-20') });
    d.deleteBlob.mockRejectedValue(new Error('blob down'));
    expect(await importNextChunk('imp1', d)).toBe('done');
  });
});

describe('runHistoryImport', () => {
  const files = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`f${i}.fit`, fitOn('2026-09-20', i % 60)]));

  it('runs chunk after chunk until the import is done, downloading each blob once', async () => {
    const d = deps({ [BLOB_URL]: zipSync(files) });
    await runHistoryImport('imp1', d, () => false);
    expect(row).toMatchObject({ status: 'done', done: 60 });
    expect(importTrainingHistory).toHaveBeenCalledTimes(3);
    expect(d.fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('stops when time is up and leaves the rest to the cron', async () => {
    const d = deps({ [BLOB_URL]: zipSync(files) });
    let steps = 0;
    await runHistoryImport('imp1', d, () => ++steps > 1);
    expect(importTrainingHistory).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: 'importing', done: 25 });
  });

  it('downloads again when the next blob is a different one', async () => {
    row = startRow({ blobUrls: [BLOB_URL, BLOB_URL_2] });
    const d = deps({ [BLOB_URL]: fitOn('2026-09-20'), [BLOB_URL_2]: fitOn('2026-09-21') });
    await runHistoryImport('imp1', d, () => false);
    expect(d.fetchBlob.mock.calls).toEqual([[BLOB_URL], [BLOB_URL_2]]);
  });

  it('stops on an error without throwing, leaving the import for the cron', async () => {
    const d = deps({ [BLOB_URL]: fitOn('2026-09-20') });
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
    const d = deps({ [BLOB_URL]: fitOn('2026-09-20') });
    let checks = 0;

    expect(await resumeImports(d, now, () => ++checks > 2)).toBe(1);

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
