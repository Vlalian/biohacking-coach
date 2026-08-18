/**
 * A minimal FIT encoder, for fixtures.
 *
 * `parseFit` is the path a real athlete's upload takes, and until this existed
 * **no test had ever called it** — `garmin.test.ts` said so plainly: "FIT is a
 * binary format not worth authoring a fixture for". That was a reasonable call
 * when the alternative was hand-assembling bytes in a test file. It is a worse
 * call now that `.fit` is the format the upload guide will tell athletes to
 * prefer, because it is the one carrying heart rate, power and cadence.
 *
 * So: enough of the FIT spec to produce a file the decoder accepts. Not a
 * general-purpose encoder — it writes exactly the three message types a simple
 * single-sport activity needs, in the one byte order that matters.
 *
 * **Why generated rather than downloaded.** Sample `.fit` files are easy to find
 * online, and every one of them contains a real GPS trace — which starts at a
 * real person's home. Committing a stranger's activity into a public repository
 * is not a fixture, it is publishing their location history. A generated file
 * has no such problem, and is deterministic and parameterisable besides.
 *
 * **What this does NOT prove.** It produces what we *expect* a FIT file to
 * contain, so it cannot surface the quirks of real ones — developer fields,
 * multisport laps, unusual units, fields absent that we assume present. It makes
 * the decode path *tested*; it does not make it *proven against reality*. That
 * needs one real file, read locally and never committed (showable-version/06).
 */

// The checksum comes from the module under test rather than a second copy here.
// Deliberate, and the tradeoff is named in `fitCrc`'s own doc: the two agree
// with each other, not necessarily with Garmin. What a shared implementation
// still proves is the property the corrupt-upload guard rests on — bytes altered
// after writing no longer match the checksum stored with them.
import { fitCrc } from './garmin';

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
const FIT_EPOCH_OFFSET_S = 631_065_600;

// FIT base types. The 0x80 bit marks a type whose byte order follows the
// message's architecture field; we always write little-endian.
const BASE_UINT8 = 0x02;
const BASE_UINT16 = 0x84;
const BASE_UINT32 = 0x86;
const BASE_SINT32 = 0x85;
const BASE_ENUM = 0x00;

type FieldDef = { num: number; size: number; base: number };

/**
 * One message type, written once as a definition and then repeatedly as data.
 * `local` is the 0-15 slot the data messages refer back to.
 */
class MessageWriter {
  constructor(
    readonly local: number,
    readonly global: number,
    readonly fields: FieldDef[],
  ) {}

  definition(): Buffer {
    const head = Buffer.alloc(6);
    head.writeUInt8(0x40 | this.local, 0); // definition-message header
    head.writeUInt8(0, 1); // reserved
    head.writeUInt8(0, 2); // architecture: 0 = little-endian
    head.writeUInt16LE(this.global, 3);
    head.writeUInt8(this.fields.length, 5);

    const defs = Buffer.concat(
      this.fields.map((f) => Buffer.from([f.num, f.size, f.base])),
    );
    return Buffer.concat([head, defs]);
  }

  data(values: number[]): Buffer {
    if (values.length !== this.fields.length) {
      throw new Error(
        `FIT fixture: message ${this.global} expects ${this.fields.length} values, got ${values.length}`,
      );
    }
    const size = this.fields.reduce((n, f) => n + f.size, 0);
    const buf = Buffer.alloc(1 + size);
    buf.writeUInt8(this.local, 0); // data-message header
    let offset = 1;
    this.fields.forEach((f, i) => {
      const v = values[i];
      if (f.base === BASE_UINT8 || f.base === BASE_ENUM) buf.writeUInt8(v, offset);
      else if (f.base === BASE_UINT16) buf.writeUInt16LE(v, offset);
      else if (f.base === BASE_UINT32) buf.writeUInt32LE(v, offset);
      else if (f.base === BASE_SINT32) buf.writeInt32LE(v, offset);
      offset += f.size;
    });
    return buf;
  }
}

const FILE_ID = new MessageWriter(0, 0, [
  { num: 0, size: 1, base: BASE_ENUM }, // type: 4 = activity
  { num: 1, size: 2, base: BASE_UINT16 }, // manufacturer
  { num: 2, size: 2, base: BASE_UINT16 }, // product
  { num: 4, size: 4, base: BASE_UINT32 }, // time_created
]);

const RECORD = new MessageWriter(1, 20, [
  { num: 253, size: 4, base: BASE_UINT32 }, // timestamp
  { num: 0, size: 4, base: BASE_SINT32 }, // position_lat, semicircles
  { num: 1, size: 4, base: BASE_SINT32 }, // position_long, semicircles
  { num: 2, size: 2, base: BASE_UINT16 }, // altitude, (m + 500) * 5
  { num: 3, size: 1, base: BASE_UINT8 }, // heart_rate, bpm
  { num: 4, size: 1, base: BASE_UINT8 }, // cadence, rpm
  { num: 5, size: 4, base: BASE_UINT32 }, // distance, cm
  { num: 6, size: 2, base: BASE_UINT16 }, // speed, mm/s
  { num: 7, size: 2, base: BASE_UINT16 }, // power, watts
]);

const SESSION = new MessageWriter(2, 18, [
  { num: 253, size: 4, base: BASE_UINT32 }, // timestamp
  { num: 2, size: 4, base: BASE_UINT32 }, // start_time
  { num: 5, size: 1, base: BASE_ENUM }, // sport
  { num: 7, size: 4, base: BASE_UINT32 }, // total_elapsed_time, ms
  { num: 8, size: 4, base: BASE_UINT32 }, // total_timer_time, ms
  { num: 9, size: 4, base: BASE_UINT32 }, // total_distance, cm
  { num: 16, size: 1, base: BASE_UINT8 }, // avg_heart_rate
  { num: 17, size: 1, base: BASE_UINT8 }, // max_heart_rate
]);

/** FIT sport enum values, for the ones this project plans around. */
export const FIT_SPORT = { running: 1, cycling: 2, swimming: 5 } as const;
export type FitSport = keyof typeof FIT_SPORT;

export interface FitFixtureOptions {
  /** Activity start. Defaults to a fixed date so fixtures are deterministic. */
  start?: Date;
  /** Number of one-second samples. */
  samples?: number;
  sport?: FitSport;
  /** Constant heart rate, bpm. Real files vary; a fixture does not need to. */
  heartRate?: number;
  cadence?: number;
  power?: number;
  /** Metres per second, used to derive distance and speed. */
  speedMps?: number;
  /**
   * Start position in degrees. Defaults to open water off Copenhagen rather
   * than anywhere someone lives — a fixture should not carry a plausible home
   * address even when it is invented.
   */
  lat?: number;
  lon?: number;
}

const DEG_TO_SEMICIRCLES = 2 ** 31 / 180;

/**
 * Builds a FIT file as a Buffer: a `file_id`, a run of `record` messages one
 * second apart, and a closing `session`.
 *
 * Deterministic by default — same options, same bytes — so it can be used as a
 * test fixture and compared across runs.
 */
export function buildFitFile(options: FitFixtureOptions = {}): Buffer {
  const {
    start = new Date('2026-08-17T06:00:00Z'),
    samples = 60,
    sport = 'cycling',
    heartRate = 142,
    cadence = 88,
    power = 210,
    speedMps = 8.5,
    lat = 55.71,
    lon = 12.62,
  } = options;

  const startS = Math.floor(start.getTime() / 1000) - FIT_EPOCH_OFFSET_S;

  const parts: Buffer[] = [
    FILE_ID.definition(),
    FILE_ID.data([4, 1, 0, startS]), // type=activity, manufacturer=garmin
    RECORD.definition(),
  ];

  for (let i = 0; i < samples; i++) {
    const distanceM = speedMps * i;
    parts.push(
      RECORD.data([
        startS + i,
        Math.round((lat + i * 0.00002) * DEG_TO_SEMICIRCLES),
        Math.round((lon + i * 0.00002) * DEG_TO_SEMICIRCLES),
        Math.round((10 + i * 0.1 + 500) * 5), // gentle climb from 10 m
        heartRate,
        cadence,
        Math.round(distanceM * 100),
        Math.round(speedMps * 1000),
        power,
      ]),
    );
  }

  const elapsedMs = samples * 1000;
  parts.push(
    SESSION.definition(),
    SESSION.data([
      startS + samples,
      startS,
      FIT_SPORT[sport],
      elapsedMs,
      elapsedMs,
      Math.round(speedMps * samples * 100),
      heartRate,
      heartRate + 12,
    ]),
  );

  const data = Buffer.concat(parts);

  // 14-byte header. `dataSize` counts the records only — not the header, and
  // not the trailing CRC.
  const header = Buffer.alloc(14);
  header.writeUInt8(14, 0);
  header.writeUInt8(0x20, 1); // protocol version 2.0
  header.writeUInt16LE(2140, 2); // profile version
  header.writeUInt32LE(data.length, 4);
  header.write('.FIT', 8, 'ascii');
  header.writeUInt16LE(fitCrc(header.subarray(0, 12)), 12);

  const body = Buffer.concat([header, data]);
  const crc = Buffer.alloc(2);
  crc.writeUInt16LE(fitCrc(body), 0);
  return Buffer.concat([body, crc]);
}

/**
 * A GPX track covering the same shape, for the other accepted format.
 *
 * GPX is XML and needs no encoder; it is here so both formats come from one
 * place and a fixture set stays consistent.
 */
export function buildGpxFile(options: FitFixtureOptions = {}): string {
  const {
    start = new Date('2026-08-17T06:00:00Z'),
    samples = 60,
    heartRate = 142,
    lat = 55.71,
    lon = 12.62,
  } = options;

  const points = Array.from({ length: samples }, (_, i) => {
    const time = new Date(start.getTime() + i * 1000).toISOString();
    return `      <trkpt lat="${(lat + i * 0.00002).toFixed(6)}" lon="${(lon + i * 0.00002).toFixed(6)}">
        <ele>${(10 + i * 0.1).toFixed(1)}</ele>
        <time>${time}</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${heartRate}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="synthetic-fixture" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <name>Synthetic fixture</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}
