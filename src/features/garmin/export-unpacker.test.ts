import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { buildFitFile } from './fit-fixture';
import { unpackZipStream, type UnpackedEntry } from './export-unpacker';

/**
 * `garmin-integration/04` — a Garmin export is unpacked once, streaming, so a
 * 500 MB zip never sits in function memory whole. Real zips, built with
 * fflate; the stream is fed in small chunks the way a download arrives.
 */
const FIT = new Uint8Array(buildFitFile({ start: new Date('2026-09-20T06:00:00Z') }));
const GPX = strToU8('<gpx></gpx>');

/** The bytes as a stream of `size`-byte chunks. */
function streamOf(bytes: Uint8Array, size = 97): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

type Seen = { index: number; entry: UnpackedEntry };

async function unpack(bytes: Uint8Array, from = 0, stop: (seen: Seen[]) => boolean = () => false, chunkSize = 97) {
  const seen: Seen[] = [];
  const complete = await unpackZipStream(
    streamOf(bytes, chunkSize),
    from,
    async (entry, index) => {
      seen.push({ index, entry });
    },
    () => stop(seen),
  );
  return { complete, seen };
}

const names = (seen: Seen[]) => seen.map(({ index, entry }) => `${index}:${entry.kind === 'file' ? entry.name : entry.kind}`);

/** A Garmin-shaped export: activity files at the top, and more a zip deep, beside files that are not activities. */
function garminExport(): Uint8Array {
  const part1 = zipSync({ 'a.fit': FIT, 'notes.txt': strToU8('x'), 'b.FIT': FIT, 'deeper.zip': zipSync({ 'c.fit': FIT }) });
  return zipSync({
    'top.gpx': GPX,
    'DI_CONNECT/summary.json': strToU8('{}'),
    'DI_CONNECT/UploadedFiles_0-_Part1.zip': part1,
    'last.fit': FIT,
  });
}

describe('unpackZipStream', () => {
  it('hands over every .fit and .gpx, a zip deep included, by its own name, in archive order, and nothing else', async () => {
    const { complete, seen } = await unpack(garminExport());
    expect(complete).toBe(true);
    expect(names(seen)).toEqual(['0:top.gpx', '1:a.fit', '2:b.FIT', '3:last.fit']);
    expect(seen.map((s) => s.entry)).toEqual([
      { kind: 'file', name: 'top.gpx', bytes: GPX },
      { kind: 'file', name: 'a.fit', bytes: FIT },
      { kind: 'file', name: 'b.FIT', bytes: FIT },
      { kind: 'file', name: 'last.fit', bytes: FIT },
    ]);
  });

  it('reads a zip whose entries are stored rather than deflated', async () => {
    const stored = zipSync({ 'a.fit': FIT, 'inner.zip': zipSync({ 'b.gpx': GPX }, { level: 0 }) }, { level: 0 });
    expect(names((await unpack(stored)).seen)).toEqual(['0:a.fit', '1:b.gpx']);
  });

  it('skips the entries before `from` and numbers the rest as before', async () => {
    const { complete, seen } = await unpack(garminExport(), 2);
    expect(complete).toBe(true);
    expect(names(seen)).toEqual(['2:b.FIT', '3:last.fit']);
  });

  it('stops between chunks when asked, before the end, and says it is not complete', async () => {
    const { complete, seen } = await unpack(garminExport(), 0, (s) => s.length >= 2);
    expect(complete).toBe(false);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.length).toBeLessThan(4);
    expect(seen.map((s) => s.index)).toEqual(seen.map((_, i) => i));
  });

  it('asks before the first read, so a run already out of time reads nothing', async () => {
    const { complete, seen } = await unpack(garminExport(), 0, () => true);
    expect(complete).toBe(false);
    expect(seen).toEqual([]);
  });

  it('counts an upload that is not a zip as one archive that would not open', async () => {
    const { complete, seen } = await unpack(strToU8('this is not a zip file, whatever its name says'));
    expect(complete).toBe(true);
    expect(names(seen)).toEqual(['0:failed']);
  });

  it('counts a nested zip that will not open once, and keeps reading after it', async () => {
    const outer = zipSync({ 'a.fit': FIT, 'broken.zip': strToU8('not a zip'), 'b.fit': FIT });
    expect(names((await unpack(outer)).seen)).toEqual(['0:a.fit', '1:failed', '2:b.fit']);
  });

  it('does not count a failure again when a later run starts past it', async () => {
    const outer = zipSync({ 'a.fit': FIT, 'broken.zip': strToU8('not a zip'), 'b.fit': FIT });
    expect(names((await unpack(outer, 2)).seen)).toEqual(['2:b.fit']);
  });

  it('counts an activity file whose data will not inflate as failed, and carries on', async () => {
    const good = zipSync({ 'a.fit': FIT, 'b.fit': FIT });
    const bytes = corruptDataOf(good, 'a.fit');
    expect(names((await unpack(bytes)).seen)).toEqual(['0:failed', '1:b.fit']);
  });

  it('reads the same whether the download arrives a byte at a time or all at once', async () => {
    const expected = ['0:top.gpx', '1:a.fit', '2:b.FIT', '3:last.fit'];
    expect(names((await unpack(garminExport(), 0, undefined, 1)).seen)).toEqual(expected);
    expect(names((await unpack(garminExport(), 0, undefined, Infinity)).seen)).toEqual(expected);
  });

  it('counts an upload shorter than a zip’s signature as one that would not open', async () => {
    expect(names((await unpack(strToU8('PK'), 0, undefined, 1)).seen)).toEqual(['0:failed']);
    expect(names((await unpack(new Uint8Array(0))).seen)).toEqual(['0:failed']);
  });

  it('reads nothing of a zip with other bytes in front of it', async () => {
    const prefixed = new Uint8Array([...strToU8('JUNK'), ...zipSync({ 'a.fit': FIT })]);
    expect(names((await unpack(prefixed)).seen)).toEqual(['0:failed']);
  });

  it('names a file without its folders, and passes over names that only look like activities or zips', async () => {
    const zip = zipSync({
      'dir/sub/a.fit': FIT,
      'a.fit.txt': FIT,
      'xfit': FIT,
      'b.gpx.bak': GPX,
      'cgpx': GPX,
      'x.zip.txt': zipSync({ 'no1.fit': FIT }),
      'xzip': zipSync({ 'no2.fit': FIT }),
    });
    expect(names((await unpack(zip)).seen)).toEqual(['0:a.fit']);
  });

  it('counts a nested zip whose data will not inflate as one failure, and carries on', async () => {
    const outer = zipSync({ 'part.zip': zipSync({ 'a.fit': FIT }), 'c.fit': FIT });
    expect(names((await unpack(corruptDataOf(outer, 'part.zip'))).seen)).toEqual(['0:failed', '1:c.fit']);
  });

  it('counts a zip cut off part-way as one failure after what it could read', async () => {
    const whole = zipSync({ 'a.fit': FIT, 'b.fit': FIT }, { level: 0 });
    const { complete, seen } = await unpack(cutInside(whole, 'b.fit'));
    expect(complete).toBe(true);
    // b.fit was found (index 1) and never finished; the failure is the archive's own.
    expect(names(seen)).toEqual(['0:a.fit', '2:failed']);
  });

  it('counts a nested zip cut off part-way once, keeping what it read', async () => {
    const inner = zipSync({ 'a.fit': FIT, 'b.fit': FIT }, { level: 0 });
    const outer = zipSync({ 'part.zip': cutInside(inner, 'b.fit'), 'c.fit': FIT }, { level: 0 });
    expect(names((await unpack(outer)).seen)).toEqual(['0:a.fit', '2:failed', '3:c.fit']);
  });
});

/** The zip with the named entry's deflated data overwritten by bytes no inflater accepts. */
function corruptDataOf(zip: Uint8Array, name: string): Uint8Array {
  const out = zip.slice();
  const at = indexOfName(out, name) + name.length;
  // 0xff opens a deflate block of reserved type 3, which is always an error.
  out.fill(0xff, at, at + 8);
  return out;
}

/** The zip cut off 100 bytes into the named entry's data. */
function cutInside(zip: Uint8Array, name: string): Uint8Array {
  return zip.slice(0, indexOfName(zip, name) + name.length + 100);
}

function indexOfName(bytes: Uint8Array, name: string): number {
  const needle = strToU8(name);
  outer: for (let i = 0; i < bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
