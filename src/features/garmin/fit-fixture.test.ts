import { describe, it, expect } from 'vitest';
import { buildFitFile, buildGpxFile } from './fit-fixture';
import { parseFit, parseGpx, fitCrc } from './garmin';

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

/**
 * The sessions of a file expected to decode. Fails loudly rather than returning
 * an empty list, so a happy-path test that starts failing says *why* instead of
 * dying on a destructure two lines later.
 */
async function readFit(buffer: Buffer) {
  const result = await parseFit(buffer);
  if (!result.ok) throw new Error(`expected a decodable FIT file, got: ${result.reason}`);
  return result.sessions;
}

describe('parseFit — a well-formed file', () => {
  it('decodes a session with its streams', async () => {
    const sessions = await readFit(buildFitFile({ samples: 60 }));

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
    const [s] = await readFit(buildFitFile({ power: 240, cadence: 92 }));
    expect(s.streams.powerW?.some((v) => v === 240)).toBe(true);
    expect(s.streams.cadenceRpm?.some((v) => v === 92)).toBe(true);
  });

  it('reports the session summary the calendar shows', async () => {
    const [s] = await readFit(buildFitFile({ samples: 120, heartRate: 150 }));
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
  // used to get one generic error; each case now carries its own reason so the
  // copy can tell them apart (showable-version/06).

  it('names an empty file rather than throwing', async () => {
    await expect(parseFit(Buffer.alloc(0))).resolves.toEqual({
      ok: false,
      reason: 'not-a-fit-file',
    });
  });

  it('names a truncated file — the half-finished download case', async () => {
    // It still claims to be FIT: the magic is in the surviving header, so this
    // is damage to a real file, not the wrong file entirely.
    const whole = buildFitFile({ samples: 60 });
    await expect(
      parseFit(whole.subarray(0, Math.floor(whole.length / 2))),
    ).resolves.toEqual({ ok: false, reason: 'corrupt' });
  });
});

describe('parseFit — the wrong file fails fast, and says which failure', () => {
  it('names a file that is not FIT at all', { timeout: 2000 }, async () => {
    await expect(parseFit(Buffer.from('this is a text file'))).resolves.toEqual({
      ok: false,
      reason: 'not-a-fit-file',
    });
  });

  it('names a header claiming a data size the file does not have', { timeout: 2000 }, async () => {
    const lying = Buffer.from(buildFitFile({ samples: 10 }));
    lying.writeUInt32LE(999_999, 4);

    await expect(parseFit(lying)).resolves.toEqual({ ok: false, reason: 'corrupt' });
  });

  it('refuses a file that fails its own CRC', { timeout: 2000 }, async () => {
    // Mads's decision, 2026-08-18: the training record is immutable once
    // written, so corrupt data must not enter it silently. This replaces the
    // earlier test that recorded `force: true` accepting the file.
    const corrupt = Buffer.from(buildFitFile({ samples: 60 }));
    corrupt[40] = corrupt[40] ^ 0xff;

    await expect(parseFit(corrupt)).resolves.toEqual({ ok: false, reason: 'corrupt' });
  });

  // Both cases below re-stamp the trailing file CRC after touching the header.
  // Without that they prove nothing about the header check: the file CRC covers
  // the header bytes too, so it would catch the damage on its own and the test
  // would pass whether or not the header CRC is ever read.
  const restampFileCrc = (file: Buffer) => {
    const end = file.length - 2;
    file.writeUInt16LE(fitCrc(file.subarray(0, end)), end);
    return file;
  };

  it('catches a damaged header by its own CRC, before trusting its data size', { timeout: 2000 }, async () => {
    // CodeRabbit, PR #35. A damaged header that still satisfies the file CRC is
    // exactly the case the header CRC exists for — otherwise `dataSize` is read
    // from bytes nothing has verified.
    const damaged = restampFileCrc(Buffer.from(buildFitFile({ samples: 10 })));
    damaged.writeUInt16LE(damaged.readUInt16LE(2) ^ 0xff, 2); // profile version
    restampFileCrc(damaged);

    await expect(parseFit(damaged)).resolves.toEqual({ ok: false, reason: 'corrupt' });
  });

  it('still accepts a header whose optional CRC is absent', { timeout: 2000 }, async () => {
    // Zero means "not written" in the spec, not "checksum of zero". Writers
    // that omit it are common, and refusing a valid export is the failure this
    // path watches for — so the zero case must stay legitimate.
    const noHeaderCrc = Buffer.from(buildFitFile({ samples: 10 }));
    noHeaderCrc.writeUInt16LE(0, 12);
    restampFileCrc(noHeaderCrc);

    const result = await parseFit(noHeaderCrc);
    expect(result.ok).toBe(true);
  });

  it('still reads a well-formed file', { timeout: 2000 }, async () => {
    const result = await parseFit(buildFitFile({ samples: 60 }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sessions).toHaveLength(1);
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
