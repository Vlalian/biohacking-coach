import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { buildFitFile, buildGpxFile } from './fit-fixture';
import { uploadPolicy, MAX_UPLOAD_BYTES, MAX_ACTIVITY_BYTES, withinWindow, HISTORY_WINDOW_WEEKS, acceptsPathname, isOwnBlobUrl, expandUpload, advanceImport, advanceUnpack, extractedPathname, nextZip, importRunning, importSummary, IMPORT_CHUNK_FILES, blobPrefix, uploadState, contentTypeFor, uploadKindOf, TOKEN_VALID_MS } from './blob-upload';

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
    expect(uploadPolicy(null, { athleteId: 'a1', historyLocked: false })).toEqual({ ok: false, reason: 'bad-kind' });
  });

  it('allows a detection upload even when the history is locked, capped at 500 MB, under the athlete prefix', () => {
    const p = uploadPolicy('detection', { athleteId: 'a1', historyLocked: true });
    expect(p).toMatchObject({ ok: true, maximumSizeInBytes: 500 * 1024 * 1024, pathPrefix: 'garmin/detection/a1/' });
    expect(MAX_UPLOAD_BYTES).toBe(500 * 1024 * 1024);
  });

  it('caps one activity file inside an export at 64 MB inflated', () => {
    expect(MAX_ACTIVITY_BYTES).toBe(64 * 1024 * 1024);
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

describe('uploadKindOf', () => {
  it('reads the kind from the client payload', () => {
    expect(uploadKindOf(JSON.stringify({ kind: 'history' }))).toBe('history');
    expect(uploadKindOf(JSON.stringify({ kind: 'detection', athleteId: 'a2' }))).toBe('detection');
  });

  it('is null for anything else — no payload, not JSON, not an object, an unknown kind', () => {
    for (const payload of [null, '', 'not json', '"history"', 'null', '[]', JSON.stringify({ kind: 'other' }), JSON.stringify({})]) {
      expect(uploadKindOf(payload)).toBeNull();
    }
  });
});

describe('TOKEN_VALID_MS', () => {
  it('lets a token live an hour — long enough for 500 MB on a slow line, and no longer', () => {
    expect(TOKEN_VALID_MS).toBe(60 * 60 * 1000);
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

  it('reads only a real extension at the end of the name', () => {
    for (const name of ['x.zip.fit', 'xzip', 'x.gpx.fit', 'xgpx']) expect(contentTypeFor(name)).toBe('application/octet-stream');
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
    expect(acceptsPathname(PREFIX, `${PREFIX}ridefit`)).toBe(false);
    expect(acceptsPathname(PREFIX, `${PREFIX}ride.fit.txt`)).toBe(false);
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
    expect(expandUpload('x.fit', FIT)).toEqual({ files: [{ name: 'x.fit', bytes: FIT }], failed: 0 });
    expect(expandUpload('x.GPX', GPX)).toEqual({ files: [{ name: 'x.GPX', bytes: GPX }], failed: 0 });
  });

  it('opens one nested zip deep and no deeper', () => {
    const inner = zipSync({ 'f1.fit': FIT, 'f2.fit': FIT, 'deeper.zip': zipSync({ 'no.fit': FIT }) });
    const outer = zipSync({ 'top.gpx': GPX, 'p1.zip': inner, 'dir/f3.FIT': FIT });
    expect(expandUpload('e.zip', outer).files.map((f) => f.name).sort()).toEqual(['f1.fit', 'f2.fit', 'f3.FIT', 'top.gpx']);
    expect(expandUpload('e.zip', outer).failed).toBe(0);
  });

  it('keeps the bytes of each file, not the zip’s', () => {
    const [file] = expandUpload('e.zip', zipSync({ 'a.fit': FIT })).files;
    expect(file.bytes).toEqual(FIT);
  });

  it('counts an archive it cannot open as failed rather than throwing', () => {
    expect(expandUpload('broken.zip', strToU8('not a zip'))).toEqual({ files: [], failed: 1 });
    const outer = zipSync({ 'bad.zip': strToU8('nope'), 'a.fit': FIT });
    expect(expandUpload('e.zip', outer)).toEqual({ files: [{ name: 'a.fit', bytes: FIT }], failed: 1 });
  });

  it('reads the activities of a zip whose other entries would not inflate', () => {
    const zip = zipSync({ 'a.fit': FIT, 'summary.json': strToU8('{"sessions": []}'.repeat(50)) });
    const at = indexOfName(zip, 'summary.json') + 'summary.json'.length;
    const broken = zip.slice();
    // 0xff opens a deflate block of reserved type 3, which no inflater accepts.
    broken.fill(0xff, at, at + 8);
    expect(expandUpload('e.zip', broken)).toEqual({ files: [{ name: 'a.fit', bytes: FIT }], failed: 0 });
  });

  it('holds nothing for a file of another type', () => {
    for (const name of ['notes.txt', 'x.fit.txt', 'xfit', 'xzip', 'x.zip.txt']) {
      expect(expandUpload(name, zipSync({ 'a.fit': FIT }))).toEqual({ files: [], failed: 0 });
    }
  });

  it('reads only a real .fit, .gpx or .zip inside the zip, and names each file without its folders', () => {
    const inner = zipSync({ 'deep/c.fit': FIT, 'cfit': FIT });
    const outer = zipSync({
      'dir/a.fit': FIT,
      'notes.fit.txt': FIT,
      'xfit': FIT,
      'xgpx': GPX,
      'nested.zip': inner,
      'azip': inner,
      'b.zip.txt': inner,
    });
    expect(expandUpload('e.zip', outer)).toEqual({
      failed: 0,
      files: [
        { name: 'a.fit', bytes: FIT },
        { name: 'c.fit', bytes: FIT },
      ],
    });
  });

  it('keeps reading after a nested zip that will not open', () => {
    const outer = zipSync({ 'a.fit': FIT, 'bad.zip': strToU8('nope'), 'good.zip': zipSync({ 'b.fit': FIT, 'c.fit': FIT }) });
    expect(expandUpload('e.zip', outer)).toEqual({ failed: 1, files: ['a.fit', 'b.fit', 'c.fit'].map((name) => ({ name, bytes: FIT })) });
  });
});

describe('nextZip', () => {
  const HOST = 'https://s.private.blob.vercel-storage.com/garmin/history/a1/';

  it('is the first upload that is a zip, whatever else is in the list', () => {
    expect(nextZip([`${HOST}ride.fit`, `${HOST}export-Ab1.ZIP`, `${HOST}second.zip`])).toBe(`${HOST}export-Ab1.ZIP`);
  });

  it('is null once only single files are left', () => {
    expect(nextZip([`${HOST}ride.fit`, `${HOST}imp1/0.gpx`, `${HOST}notes.zip.txt`])).toBeNull();
    expect(nextZip([])).toBeNull();
  });
});

describe('extractedPathname', () => {
  it('puts each extracted file under the import, by its number and lower-case extension', () => {
    expect(extractedPathname('a1', 'imp1', 7, 'Morning Ride.FIT')).toBe('garmin/history/a1/imp1/7.fit');
    expect(extractedPathname('a1', 'imp1', 0, 'x.gpx')).toBe('garmin/history/a1/imp1/0.gpx');
  });

  it('sits under the athlete’s history prefix, so the bulk remove and erasure find it', () => {
    expect(extractedPathname('a1', 'imp1', 3, 'a.fit').startsWith(blobPrefix('history', 'a1'))).toBe(true);
  });
});

describe('advanceUnpack', () => {
  const START = { blobUrls: ['z1.zip', 'r.fit'], cursor: 0, total: 0, done: 0, skippedOld: 0, failed: 0 };

  it('appends what was extracted, moves the cursor past it, and counts failures as read files', () => {
    expect(advanceUnpack(START, 'z1.zip', { extracted: ['e0', 'e2'], failed: 1, complete: false })).toEqual({
      blobUrls: ['z1.zip', 'r.fit', 'e0', 'e2'],
      cursor: 3,
      total: 3,
      done: 1,
      skippedOld: 0,
      failed: 1,
      status: 'unpacking',
      finishedZip: null,
    });
  });

  it('carries on from where the last save left the zip', () => {
    const later = advanceUnpack({ ...START, blobUrls: ['z1.zip', 'e0'], cursor: 25, total: 25 }, 'z1.zip', { extracted: ['e25'], failed: 0, complete: false });
    expect(later).toMatchObject({ blobUrls: ['z1.zip', 'e0', 'e25'], cursor: 26, total: 26, done: 0 });
  });

  it('drops a zip read to its end and names it for deletion, starting the next zip from the top', () => {
    const row = { ...START, blobUrls: ['z1.zip', 'z2.zip', 'e0'], cursor: 4, total: 4 };
    expect(advanceUnpack(row, 'z1.zip', { extracted: ['e4'], failed: 0, complete: true })).toMatchObject({
      blobUrls: ['z2.zip', 'e0', 'e4'],
      cursor: 0,
      total: 5,
      status: 'unpacking',
      finishedZip: 'z1.zip',
    });
  });

  it('turns to importing once no zip is left, with every file left to read in the total', () => {
    const row = { ...START, blobUrls: ['r.fit', 'z1.zip', 'e0'], cursor: 2, total: 2, done: 1, failed: 1 };
    expect(advanceUnpack(row, 'z1.zip', { extracted: ['e2'], failed: 0, complete: true })).toEqual({
      blobUrls: ['r.fit', 'e0', 'e2'],
      cursor: 0,
      total: 4,
      done: 1,
      skippedOld: 0,
      failed: 1,
      status: 'importing',
      finishedZip: 'z1.zip',
    });
  });

  it('turns to importing at once when the upload held no zip', () => {
    expect(advanceUnpack({ ...START, blobUrls: ['r.fit', 's.gpx'] }, null, { extracted: [], failed: 0, complete: true })).toMatchObject({
      blobUrls: ['r.fit', 's.gpx'],
      total: 2,
      status: 'importing',
      finishedZip: null,
    });
  });

  it('counts a zip that is gone as one failed file and drops it', () => {
    expect(advanceUnpack({ ...START, blobUrls: ['z1.zip'] }, 'z1.zip', { extracted: [], failed: 1, complete: true })).toMatchObject({
      blobUrls: [],
      total: 1,
      done: 1,
      failed: 1,
      status: 'importing',
      finishedZip: 'z1.zip',
    });
  });
});

describe('advanceImport', () => {
  const START = { blobUrls: ['f1', 'f2', 'f3'], cursor: 0, total: 3, done: 0, skippedOld: 0, failed: 0 };

  it('reads 25 files at a time', () => {
    expect(IMPORT_CHUNK_FILES).toBe(25);
  });

  it('drops the files read, moves the cursor, and adds up what became of them', () => {
    expect(advanceImport(START, { read: 2, failed: 1, skippedOld: 4 })).toEqual({
      blobUrls: ['f3'],
      cursor: 2,
      total: 3,
      done: 2,
      skippedOld: 4,
      failed: 1,
      status: 'importing',
    });
  });

  it('is done once no file is left', () => {
    const row = { ...START, blobUrls: ['f3'], cursor: 2, done: 2, failed: 1, skippedOld: 4 };
    expect(advanceImport(row, { read: 1, failed: 0, skippedOld: 1 })).toEqual({
      blobUrls: [],
      cursor: 3,
      total: 3,
      done: 3,
      skippedOld: 5,
      failed: 1,
      status: 'done',
    });
  });
});

describe('importRunning', () => {
  it('is true while the import unpacks or imports, and false once it has stopped', () => {
    expect(importRunning('unpacking')).toBe(true);
    expect(importRunning('importing')).toBe(true);
    expect(importRunning('done')).toBe(false);
    expect(importRunning('failed')).toBe(false);
  });
});

describe('importSummary', () => {
  it('is the counts and the status, and never the blob URLs', () => {
    const row = { status: 'importing', blobUrls: ['secret'], cursor: 3, total: 1200, done: 340, skippedOld: 2100, failed: 1 } as const;
    expect(importSummary(row)).toEqual({ status: 'importing', total: 1200, done: 340, skippedOld: 2100, failed: 1 });
  });
});

function indexOfName(bytes: Uint8Array, name: string): number {
  const needle = strToU8(name);
  outer: for (let i = 0; i < bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
