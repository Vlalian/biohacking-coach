import { Unzip, UnzipInflate, type UnzipFile } from 'fflate';

/**
 * Reads a Garmin export zip as it downloads (`garmin-integration/04`).
 *
 * A full export can be 500 MB, with the activity files nested a zip deep in
 * `UploadedFiles_*_PartN.zip`. Opening that whole in a function's memory is
 * what this replaces: the bytes go through fflate's streaming `Unzip` chunk by
 * chunk, a nested zip through a second `Unzip` fed from the first, and only one
 * activity file at a time is ever held whole — a `.fit` is kilobytes.
 *
 * **Numbering.** Every activity file (`.fit`, `.gpx`) gets the next number the
 * moment it is found, the zip's own and a nested zip's alike, in archive
 * order. An archive that fails — not a zip, cut off, data that will not
 * inflate — takes the next number for its one failure. Entry order in a zip is
 * fixed, so the same bytes number the same way on every read, which is what
 * lets a later run pass over the files an earlier one already handed on
 * (`from`). A zip inside a nested zip is not opened, and nothing else is kept.
 *
 * Nothing here throws on a bad archive: a failure is an entry like any other.
 */
export type UnpackedEntry = { kind: 'file'; name: string; bytes: Uint8Array } | { kind: 'failed' };

type Emit = (index: number, entry: UnpackedEntry) => void;

const ACTIVITY_FILE = /\.(fit|gpx)$/i;
const ZIP_FILE = /\.zip$/i;

/**
 * Streams `stream` through the unpacker and awaits `onEntry` for every entry
 * numbered `from` or later, in order. `shouldStop` is asked before each read;
 * when it says stop, the download is cancelled and the result is `false`.
 * `true` means the archive was read to its end.
 */
export async function unpackZipStream(
  stream: ReadableStream<Uint8Array>,
  from: number,
  onEntry: (entry: UnpackedEntry, index: number) => Promise<void>,
  shouldStop: () => boolean,
): Promise<boolean> {
  const queue: [number, UnpackedEntry][] = [];
  const archive = openArchive(new Numbering(), (index, entry) => {
    if (index >= from) queue.push([index, entry]);
  }, true);
  const reader = stream.getReader();

  for (;;) {
    if (shouldStop()) {
      await reader.cancel();
      return false;
    }
    const { done, value } = await reader.read();
    archive.push(value ?? EMPTY, done);
    for (const [index, entry] of queue.splice(0)) await onEntry(entry, index);
    if (done) return true;
  }
}

const EMPTY = new Uint8Array(0);

/** The next number to give an activity file or a failure. */
class Numbering {
  private next = 0;
  take(): number {
    return this.next++;
  }
}

/** The four bytes every zip opens with: a local file header, or the end record of an empty zip. */
const ZIP_SIGNATURES = new Set([0x04034b50, 0x06054b50]);

/**
 * One zip, fed in chunks. It reports its activity files and at most one
 * failure of its own.
 * `outer` zips open the zips inside them; nested ones do not.
 */
function openArchive(numbering: Numbering, emit: Emit, outer: boolean) {
  let failed = false;
  const opensAsZip = signatureCheck();
  const unzip = new Unzip((file) => readEntry(file, numbering, emit, outer));
  unzip.register(UnzipInflate);

  const fail = () => {
    if (failed) return;
    failed = true;
    emit(numbering.take(), { kind: 'failed' });
  };

  return {
    fail,
    // After a failure the check fails again, or fflate throws again, and `fail` counts once.
    push(chunk: Uint8Array, final: boolean) {
      if (!opensAsZip(chunk, final)) return fail();
      try {
        unzip.push(chunk, final);
      } catch {
        // A zip cut off part-way: the entry in progress never finishes.
        fail();
      }
    },
  };
}

/**
 * Watches a stream's first four bytes: true while they may still open a zip,
 * false once they are known not to — or the stream ended before four arrived.
 * Once four are held, each later chunk adds nothing to them.
 */
function signatureCheck(): (chunk: Uint8Array, final: boolean) => boolean {
  let head: Uint8Array = EMPTY;
  return (chunk, final) => {
    head = concat([head, chunk.subarray(0, 4 - head.length)]);
    if (head.length === 4) return ZIP_SIGNATURES.has(new DataView(head.buffer, head.byteOffset).getUint32(0, true));
    return !final;
  };
}

/**
 * One entry of a zip. Every entry is started, even one that is not kept:
 * fflate buffers the data of an entry nobody started, which over a whole
 * export would be most of it.
 */
function readEntry(file: UnzipFile, numbering: Numbering, emit: Emit, outer: boolean): void {
  if (ACTIVITY_FILE.test(file.name)) readActivity(file, numbering.take(), emit);
  else if (outer && ZIP_FILE.test(file.name)) readNestedZip(file, openArchive(numbering, emit, false));
  else file.ondata = () => {};
  file.start();
}

/** An activity file, gathered whole and handed on once its last byte is in; one bad chunk fails it once. */
function readActivity(file: UnzipFile, index: number, emit: Emit): void {
  const chunks: Uint8Array[] = [];
  let settled = false;
  file.ondata = (error, data, final) => {
    if (settled) return;
    if (error) {
      settled = true;
      return emit(index, { kind: 'failed' });
    }
    chunks.push(data);
    // fflate calls nothing after the final chunk, so there is nothing left to guard.
    if (final) emit(index, { kind: 'file', name: file.name.slice(file.name.lastIndexOf('/') + 1), bytes: concat(chunks) });
  };
}

/** A zip inside the export, fed to its own archive as it inflates; data that will not inflate fails it. */
function readNestedZip(file: UnzipFile, inner: ReturnType<typeof openArchive>): void {
  file.ondata = (error, data, final) => {
    if (error) inner.fail();
    else inner.push(data, final);
  };
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
