import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { buildFitFile, buildGpxFile } from './fit-fixture';
import { uploadPolicy, MAX_UPLOAD_BYTES, withinWindow, HISTORY_WINDOW_WEEKS, acceptsPathname, isOwnBlobUrl, expandUpload, advanceImport, importSummary, IMPORT_CHUNK_FILES, blobPrefix, uploadState, contentTypeFor } from './blob-upload';

/**
 * `garmin-integration/04` — the pure half of the Blob upload: who may upload
 * what, where, which activities the history keeps, and how a Garmin export is
 * opened. No Blob, no database.
 */
describe('uploadPolicy', () => {
  it('refuses a signed-out upload, a locked history, and an unknown kind', () => {
    expect(uploadPolicy('history', { athleteId: null, historyLocked: false })).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(uploadPolicy('history', { athleteId: 'a1', historyLocked: true })).toEqual({ ok: false, reason: 'locked' });
    expect(uploadPolicy('other' as never, { athleteId: 'a1', historyLocked: false })).toEqual({ ok: false, reason: 'bad-kind' });
  });

  it('allows a detection upload even when the history is locked, capped at 500 MB, under the athlete prefix', () => {
    const p = uploadPolicy('detection', { athleteId: 'a1', historyLocked: true });
    expect(p).toMatchObject({ ok: true, maximumSizeInBytes: 500 * 1024 * 1024, pathPrefix: 'garmin/detection/a1/' });
    expect(MAX_UPLOAD_BYTES).toBe(500 * 1024 * 1024);
  });

  it('allows an open history upload under its own prefix, for the three file types only', () => {
    expect(uploadPolicy('history', { athleteId: 'a1', historyLocked: false })).toEqual({
      ok: true,
      pathPrefix: 'garmin/history/a1/',
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
      allowedContentTypes: ['application/octet-stream', 'application/zip', 'application/gpx+xml', 'application/xml'],
    });
  });
});

describe('uploadState', () => {
  it('reads the athlete id and whether the history lock is taken', () => {
    expect(uploadState(null)).toEqual({ athleteId: null, historyLocked: false });
    expect(uploadState({ id: 'a1', profile: null })).toEqual({ athleteId: 'a1', historyLocked: false });
    expect(uploadState({ id: 'a1', profile: { historyImportedAt: null } })).toEqual({ athleteId: 'a1', historyLocked: false });
    expect(uploadState({ id: 'a1', profile: { historyImportedAt: '2026-09-20T10:00:00.000Z' } })).toEqual({ athleteId: 'a1', historyLocked: true });
  });
});

describe('blobPrefix', () => {
  it('is one folder per kind and athlete', () => {
    expect(blobPrefix('history', 'a1')).toBe('garmin/history/a1/');
    expect(blobPrefix('detection', 'a1')).toBe('garmin/detection/a1/');
  });
});

describe('contentTypeFor', () => {
  it('names one of the allowed types from the extension, whatever the browser said', () => {
    expect(contentTypeFor('export.ZIP')).toBe('application/zip');
    expect(contentTypeFor('run.gpx')).toBe('application/gpx+xml');
    expect(contentTypeFor('ride.fit')).toBe('application/octet-stream');
    const allowed = (uploadPolicy('history', { athleteId: 'a1', historyLocked: false }) as { allowedContentTypes: string[] }).allowedContentTypes;
    for (const name of ['a.zip', 'a.gpx', 'a.fit']) expect(allowed).toContain(contentTypeFor(name));
  });
});

describe('withinWindow', () => {
  it('keeps an activity 55 days old and drops one 57 days old', () => {
    expect(withinWindow('2026-08-01', '2026-09-25', HISTORY_WINDOW_WEEKS)).toBe(true);
    expect(withinWindow('2026-07-30', '2026-09-25', HISTORY_WINDOW_WEEKS)).toBe(false);
  });

  it('is eight weeks, and the window is the 56 days ending today', () => {
    expect(HISTORY_WINDOW_WEEKS).toBe(8);
    // 2026-08-01 is 55 days back, the first day of the window; 2026-07-31 is 56.
    expect(withinWindow('2026-07-31', '2026-09-25', 8)).toBe(false);
    expect(withinWindow('2026-09-25', '2026-09-25', 8)).toBe(true);
    expect(withinWindow('2026-09-26', '2026-09-25', 8)).toBe(true);
    expect(withinWindow('2026-09-19', '2026-09-25', 1)).toBe(true);
    expect(withinWindow('2026-09-18', '2026-09-25', 1)).toBe(false);
  });
});

describe('acceptsPathname', () => {
  const PREFIX = 'garmin/history/a1/';

  it('accepts a .fit, .gpx or .zip directly under the prefix, whatever the case of the extension', () => {
    for (const name of ['ride.fit', 'run.GPX', 'export.Zip']) expect(acceptsPathname(PREFIX, PREFIX + name)).toBe(true);
  });

  it('refuses another type, another athlete, a nested or climbing path, and a bare prefix', () => {
    expect(acceptsPathname(PREFIX, `${PREFIX}notes.txt`)).toBe(false);
    expect(acceptsPathname(PREFIX, 'garmin/history/a2/ride.fit')).toBe(false);
    expect(acceptsPathname(PREFIX, `${PREFIX}x/ride.fit`)).toBe(false);
    expect(acceptsPathname(PREFIX, `${PREFIX}../a2/ride.fit`)).toBe(false);
    expect(acceptsPathname(PREFIX, `${PREFIX}.fit`)).toBe(false);
    expect(acceptsPathname(PREFIX, `x/${PREFIX}ride.fit`)).toBe(false);
  });
});

describe('isOwnBlobUrl', () => {
  const PREFIX = 'garmin/history/a1/';
  const HOST = 'https://store1.private.blob.vercel-storage.com/';

  it('accepts a private blob under the athlete prefix', () => {
    expect(isOwnBlobUrl(`${HOST}${PREFIX}export-Xy12.zip`, PREFIX)).toBe(true);
  });

  it('refuses another athlete, another host, a public blob, plain http, and something that is not a URL', () => {
    expect(isOwnBlobUrl(`${HOST}garmin/history/a2/f.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl(`https://evil.example/${PREFIX}f.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl(`https://blob.vercel-storage.com.evil.example/${PREFIX}f.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl(`https://store1.public.blob.vercel-storage.com/${PREFIX}f.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl(`http://store1.private.blob.vercel-storage.com/${PREFIX}f.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl('not a url', PREFIX)).toBe(false);
  });

  it('refuses a path that climbs out of the prefix once resolved', () => {
    expect(isOwnBlobUrl(`${HOST}${PREFIX}../a2/f.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl(`${HOST}${PREFIX}%2e%2e/a2/f.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl(`${HOST}${PREFIX}..%2Fa2%2Ff.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl(`${HOST}${PREFIX}..%5ca2%5Cf.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl(`${HOST}${PREFIX}sub/f.zip`, PREFIX)).toBe(false);
    expect(isOwnBlobUrl(`${HOST}${PREFIX}`, PREFIX)).toBe(false);
  });

  it('accepts a name the browser had to escape', () => {
    expect(isOwnBlobUrl(`${HOST}${PREFIX}my%20ride-Ab3.fit`, PREFIX)).toBe(true);
  });
});

describe('expandUpload', () => {
  const FIT = new Uint8Array(buildFitFile());
  const GPX = strToU8(buildGpxFile());

  it('finds .fit files one zip deep and ignores everything else', () => {
    const inner = zipSync({ 'a.fit': FIT, 'readme.txt': strToU8('x') });
    const outer = zipSync({ 'DI_CONNECT/UploadedFiles_1.zip': inner, 'b.gpx': GPX, 'c.json': strToU8('{}') });
    expect(expandUpload('export.zip', outer).files.map((f) => f.name).sort()).toEqual(['a.fit', 'b.gpx']);
  });

  it('passes a plain .fit or .gpx through untouched', () => {
    expect(expandUpload('x.fit', FIT)).toEqual({ total: 1, files: [{ name: 'x.fit', bytes: FIT }], failed: 0 });
    expect(expandUpload('x.GPX', GPX)).toEqual({ total: 1, files: [{ name: 'x.GPX', bytes: GPX }], failed: 0 });
  });

  it('counts every activity file but opens only the range asked for, in a stable order', () => {
    const inner = zipSync({ 'f1.fit': FIT, 'f2.fit': FIT, 'deeper.zip': zipSync({ 'no.fit': FIT }) });
    const outer = zipSync({ 'top.gpx': GPX, 'p1.zip': inner, 'dir/f3.FIT': FIT });
    expect(expandUpload('e.zip', outer)).toMatchObject({ total: 4, failed: 0 });
    const all = expandUpload('e.zip', outer).files.map((f) => f.name);
    expect(expandUpload('e.zip', outer, { from: 1, to: 3 })).toEqual({
      total: 4,
      failed: 0,
      files: all.slice(1, 3).map((name) => ({ name, bytes: expect.any(Uint8Array) })),
    });
    expect(expandUpload('e.zip', outer, { from: 4, to: 29 }).files).toEqual([]);
    expect(expandUpload('x.fit', FIT, { from: 1, to: 25 })).toEqual({ total: 1, files: [], failed: 0 });
  });

  it('keeps the bytes of each file, not the zip’s', () => {
    const [file] = expandUpload('e.zip', zipSync({ 'a.fit': FIT })).files;
    expect(file.bytes).toEqual(FIT);
  });

  it('counts an archive it cannot open as failed rather than throwing', () => {
    expect(expandUpload('broken.zip', strToU8('not a zip'))).toEqual({ total: 0, files: [], failed: 1 });
    const outer = zipSync({ 'bad.zip': strToU8('nope'), 'a.fit': FIT });
    expect(expandUpload('e.zip', outer)).toEqual({ total: 1, files: [{ name: 'a.fit', bytes: FIT }], failed: 1 });
  });

  it('holds nothing for a file of another type', () => {
    expect(expandUpload('notes.txt', strToU8('x'))).toEqual({ total: 0, files: [], failed: 0 });
  });
});

describe('advanceImport', () => {
  const START = { blobUrls: ['u1', 'u2'], cursor: 0, total: 0, done: 0, skippedOld: 0, failed: 0 };
  const chunk = { blobTotal: 60, blobFailed: 0, read: 25, failed: 0, skippedOld: 0 };

  it('reads 25 files at a time', () => {
    expect(IMPORT_CHUNK_FILES).toBe(25);
  });

  it('counts a blob’s files when it is first opened, and moves the cursor through it', () => {
    expect(advanceImport(START, { ...chunk, failed: 2, skippedOld: 7 })).toEqual({
      blobUrls: ['u1', 'u2'],
      finishedBlob: null,
      cursor: 25,
      total: 60,
      done: 25,
      skippedOld: 7,
      failed: 2,
      status: 'importing',
    });
  });

  it('does not count the blob again on a later chunk', () => {
    const later = advanceImport({ ...START, cursor: 25, total: 60, done: 25 }, chunk);
    expect(later).toMatchObject({ cursor: 50, total: 60, done: 50, blobUrls: ['u1', 'u2'], finishedBlob: null });
  });

  it('drops a blob once its last file is read, and starts the next from the top', () => {
    const last = advanceImport({ ...START, cursor: 50, total: 60, done: 50 }, { ...chunk, read: 10 });
    expect(last).toMatchObject({ cursor: 0, done: 60, blobUrls: ['u2'], finishedBlob: 'u1', status: 'importing' });
  });

  it('is done when the last blob is dropped', () => {
    const end = advanceImport({ ...START, blobUrls: ['u2'] }, { ...chunk, blobTotal: 3, read: 3 });
    expect(end).toMatchObject({ blobUrls: [], finishedBlob: 'u2', status: 'done', total: 3, done: 3 });
  });

  it('counts an archive that would not open as one failed file, on first opening only', () => {
    const broken = { blobTotal: 0, blobFailed: 1, read: 0, failed: 0, skippedOld: 0 };
    expect(advanceImport(START, broken)).toMatchObject({ total: 1, done: 1, failed: 1, blobUrls: ['u2'], finishedBlob: 'u1' });
    const partly = { blobTotal: 40, blobFailed: 1, read: 15, failed: 0, skippedOld: 0 };
    expect(advanceImport({ ...START, cursor: 25, total: 41, done: 26, failed: 1 }, partly)).toMatchObject({ total: 41, done: 41, failed: 1, cursor: 0 });
  });

  it('is done at once when there is nothing left to read', () => {
    expect(advanceImport({ ...START, blobUrls: [] }, { blobTotal: 0, blobFailed: 0, read: 0, failed: 0, skippedOld: 0 })).toMatchObject({
      status: 'done',
      blobUrls: [],
      finishedBlob: null,
    });
  });
});

describe('importSummary', () => {
  it('is the counts and the status, and never the blob URLs', () => {
    const row = { status: 'importing', blobUrls: ['secret'], cursor: 3, total: 1200, done: 340, skippedOld: 2100, failed: 1 } as const;
    expect(importSummary(row)).toEqual({ status: 'importing', total: 1200, done: 340, skippedOld: 2100, failed: 1 });
  });
});
