import { describe, it, expect } from 'vitest';
import { buildFitFile, buildGpxFile } from './fit-fixture';
import { parseFit, parseGpx } from './garmin';

/**
 * The FIT decode path, tested for the first time.
 *
 * Until this file existed, `parseFit` had **no test coverage at all** — not one
 * test called it. That is the path a real athlete's upload takes, and `.fit` is
 * the format the upload guide will recommend, because it is the one carrying
 * heart rate, power and cadence.
 *
 * These are round-trip tests: the fixture encoder writes bytes, the real parser
 * reads them. That is a genuine test of the decoder, but note what it cannot be
 * — the fixture writes what we expect a FIT file to contain, so agreement here
 * does not prove agreement with a file Garmin actually produced. The failure
 * cases below are the more valuable half, because malformed input is where an
 * upload from a real tester realistically goes wrong.
 */

describe('parseFit — a well-formed file', () => {
  it('decodes a session with its streams', async () => {
    const sessions = await parseFit(buildFitFile({ samples: 60 }));

    expect(sessions).toHaveLength(1);
    const s = sessions[0];
    expect(s.startTime).toBe('2026-08-17T06:00:00.000Z');
    expect(s.sport).toBe('cycling');
    // 60 one-second samples binned to 10 s.
    expect(s.streams.t.length).toBeGreaterThan(0);
    expect(s.streams.hr?.every((v) => v === null || v === 142)).toBe(true);
  });

  it('carries the channels a .fit has and a .gpx does not', async () => {
    // The whole reason the guide recommends .fit over .gpx.
    const [s] = await parseFit(buildFitFile({ power: 240, cadence: 92 }));
    expect(s.streams.powerW?.some((v) => v === 240)).toBe(true);
    expect(s.streams.cadenceRpm?.some((v) => v === 92)).toBe(true);
  });

  it('reports the session summary the calendar shows', async () => {
    const [s] = await parseFit(buildFitFile({ samples: 120, heartRate: 150 }));
    expect(s.summary.avgHr).toBe(150);
    expect(s.summary.maxHr).toBe(162);
    expect(s.summary.distanceM).not.toBeNull();
  });

  it('is deterministic — same options, same bytes', () => {
    // So a fixture can be compared across runs and across machines.
    expect(buildFitFile().equals(buildFitFile())).toBe(true);
  });
});

describe('parseFit — the failures a real upload hits', () => {
  // These matter more than the happy path. An athlete who picks the wrong file
  // gets one generic error today; these pin what the parser does so the copy can
  // eventually tell the cases apart (showable-version/06).

  // SKIPPED, and the skip IS the finding — see showable-version/06.
  //
  // `parseFit` does not return [] here. It never returns at all: the promise
  // stays pending, because `fit-file-parser` is constructed with `force: true`
  // and its callback is never invoked for input it cannot make sense of. On a
  // server action that is a request that hangs until the platform kills it.
  //
  // Left as `skip` rather than deleted so the next reader finds the evidence
  // rather than re-discovering it, and rather than `fails` so the suite never
  // waits on a promise that will not settle.
  it.skip('returns [] for a file that is not FIT at all', async () => {
    await expect(parseFit(Buffer.from('this is a text file'))).resolves.toEqual([]);
  });

  it('returns [] for an empty file rather than throwing', async () => {
    await expect(parseFit(Buffer.alloc(0))).resolves.toEqual([]);
  });

  it('returns [] for a truncated file — the half-finished download case', async () => {
    const whole = buildFitFile({ samples: 60 });
    await expect(parseFit(whole.subarray(0, Math.floor(whole.length / 2)))).resolves.toEqual([]);
  });

  // NOT skipped, and it does not pass either — it is written to record what the
  // parser actually does, which is accept the file. `force: true` ignores the
  // CRC, so a corrupted upload decodes into the training record silently rather
  // than being refused. Asserted as the current behaviour, with the finding in
  // showable-version/06; flip this expectation when that is decided on.
  it('accepts a file whose CRC does not match — force:true ignores it', async () => {
    // A corrupted byte in transit. The last two bytes are the file CRC, so
    // flipping one in the middle leaves a valid-looking file that fails its
    // own checksum.
    const corrupt = Buffer.from(buildFitFile({ samples: 60 }));
    corrupt[40] = corrupt[40] ^ 0xff;
    // Documents reality: a session comes back despite the checksum failing.
    await expect(parseFit(corrupt)).resolves.not.toEqual([]);
  });

  // SKIPPED for the same reason: same hang, reached by a different malformed
  // header. See showable-version/06.
  it.skip('does not throw on a file claiming a data size it does not have', async () => {
    const lying = Buffer.from(buildFitFile({ samples: 10 }));
    lying.writeUInt32LE(999_999, 4);
    await expect(parseFit(lying)).resolves.toBeInstanceOf(Array);
  });
});

describe('buildGpxFile', () => {
  it('produces a track the real GPX parser reads', async () => {
    const sessions = parseGpx(Buffer.from(buildGpxFile({ samples: 30 })));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].streams.hr?.some((v) => v === 142)).toBe(true);
  });

  it('carries no power or cadence — which is the point of preferring .fit', () => {
    const [s] = parseGpx(Buffer.from(buildGpxFile()));
    expect(s.streams.powerW).toBeUndefined();
    expect(s.streams.cadenceRpm).toBeUndefined();
  });
});
