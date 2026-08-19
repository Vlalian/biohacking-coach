import FitParser from 'fit-file-parser';
import { XMLParser } from 'fast-xml-parser';

/**
 * Garmin file ingestion — FIT/GPX parsing, ported from the POC's `garmin.js`.
 *
 * Pure and stateless: buffers in, plain parsed-session objects out. Nothing is
 * persisted here. The columnar stream shape below (arrays binned to 10 s) is the
 * contract the future calc module consumes and the shape `session_streams`
 * stores — honoured now even though that module does not exist yet.
 *
 * An uploaded file is untrusted input. This module parses defensively (a bad
 * file yields an empty result, never a throw that leaks internals) and never
 * interpolates raw file metadata anywhere near a prompt. Metadata sanitisation
 * policy is deferred to the security-hardening ticket.
 */

/** A normalized per-sample record; `t` is seconds since the activity start. */
type SampleRecord = {
  t: number;
  hr?: number;
  speedMps?: number;
  altM?: number;
  powerW?: number;
  cadenceRpm?: number;
  distanceM?: number;
};

/** Columnar streams at 10 s resolution — the calc-module / storage contract. */
export type Streams = {
  t: number[];
  hr?: (number | null)[];
  speedMps?: (number | null)[];
  altM?: (number | null)[];
  powerW?: (number | null)[];
  cadenceRpm?: (number | null)[];
};

export type Summary = {
  avgHr: number | null;
  maxHr: number | null;
  avgSpeedMps: number | null;
  distanceM: number | null;
  ascentM: number | null;
  avgPowerW: number | null;
};

export type ParsedSession = {
  date: string;
  sessionType: string;
  duration: number | null;
  note: string;
  startTime: string | null;
  sport: string | null;
  summary: Summary;
  streams: Streams;
};

const SPORT_MAP: Record<string, string> = {
  running: 'Endurance',
  cycling: 'Endurance',
  swimming: 'Endurance',
  triathlon: 'Endurance',
  open_water: 'Endurance',
  rowing: 'Endurance',
  strength_training: 'Strength',
  training: 'Strength',
};

export function inferSessionType(sport: unknown = ''): string {
  // Defensive: a nested XML element parses to an object, not a string. Anything
  // non-string falls straight to the safe default rather than throwing.
  if (typeof sport !== 'string') return 'Endurance';
  return SPORT_MAP[sport.toLowerCase()] || 'Endurance';
}

/** Longest a raw file-derived label may be stored/displayed (slice 16). */
const MAX_FILE_TEXT = 64;

/**
 * Bounds a raw file-derived string at the parse boundary (slice 16, route 10
 * ballot 3): control characters stripped, length capped, so the database never
 * holds arbitrary `.fit`/`.gpx` text even in display-only columns like `sport`
 * and `note`. This is the *storage* guard; the *prompt* guard is that raw file
 * text is never interpolated into prompt text — only `sessionType`, which
 * always passes through {@link inferSessionType}'s lookup, reaches a prompt.
 */
export function boundFileText(value: unknown): string | null {
  // Defensive against a non-string (a nested XML element parses to an object):
  // treat anything but a string as absent rather than throwing on `.replace`.
  if (typeof value !== 'string') return null;
  // Strip ASCII control characters (C0 range + DEL), then cap the length.
  const cleaned = value.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return cleaned ? cleaned.slice(0, MAX_FILE_TEXT) : null;
}

const BIN_SECONDS = 10;
const STREAM_CHANNELS = ['hr', 'speedMps', 'altM', 'powerW', 'cadenceRpm'] as const;
type Channel = (typeof STREAM_CHANNELS)[number];

function round2(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(v * 100) / 100;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Columnar streams at 10 s resolution: mean per bin. Channels with no samples
 * anywhere are omitted entirely (never null-filled arrays); a bin missing
 * samples for a present channel yields null at that index.
 */
export function downsampleRecords(records?: SampleRecord[]): Streams {
  const bins = new Map<number, Partial<Record<Channel, number[]>>>();
  for (const r of records || []) {
    if (!isNum(r.t) || r.t < 0) continue;
    const bin = Math.floor(r.t / BIN_SECONDS) * BIN_SECONDS;
    let acc = bins.get(bin);
    if (!acc) {
      acc = {};
      bins.set(bin, acc);
    }
    for (const ch of STREAM_CHANNELS) {
      const v = r[ch];
      if (isNum(v)) (acc[ch] || (acc[ch] = [])).push(v);
    }
  }
  const t = [...bins.keys()].sort((a, b) => a - b);
  const streams: Streams = { t };
  for (const ch of STREAM_CHANNELS) {
    if (!t.some((bin) => bins.get(bin)![ch])) continue;
    streams[ch] = t.map((bin) => {
      const vals = bins.get(bin)![ch];
      return vals ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    });
  }
  return streams;
}

/** Per-workout summary computed from records; null where the channel is absent. */
export function summarizeRecords(records?: SampleRecord[]): Summary {
  const chan = (ch: keyof SampleRecord) =>
    (records || []).map((r) => r[ch]).filter(isNum);
  const mean = (a: number[]) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const hr = chan('hr');
  const alt = chan('altM');
  const dist = chan('distanceM');
  let ascent: number | null = null;
  if (alt.length > 1) {
    ascent = 0;
    for (let i = 1; i < alt.length; i++) {
      const d = alt[i] - alt[i - 1];
      if (d > 0) ascent += d;
    }
  }
  return {
    avgHr: round2(mean(hr)),
    maxHr: hr.length ? hr.reduce((a, b) => Math.max(a, b), -Infinity) : null,
    avgSpeedMps: round2(mean(chan('speedMps'))),
    distanceM: dist.length > 1 ? round2(dist[dist.length - 1] - dist[0]) : null,
    ascentM: round2(ascent),
    avgPowerW: round2(mean(chan('powerW'))),
  };
}

function numOr(v: unknown, fallback: number | null): number | null {
  return isNum(v) ? round2(v) : fallback != null ? fallback : null;
}

// ── FIT ───────────────────────────────────────────────────────────────────────

type FitRecord = {
  timestamp?: string | Date;
  heart_rate?: number;
  speed?: number;
  altitude?: number;
  power?: number;
  cadence?: number;
  distance?: number;
};

function normalizeFitRecord(r: FitRecord, startMs: number): SampleRecord {
  const ts = r.timestamp ? new Date(r.timestamp).getTime() : NaN;
  return {
    t: (ts - startMs) / 1000,
    hr: isNum(r.heart_rate) ? r.heart_rate : undefined,
    speedMps: isNum(r.speed) ? r.speed : undefined,
    altM: isNum(r.altitude) ? r.altitude : undefined,
    powerW: isNum(r.power) ? r.power : undefined,
    cadenceRpm: isNum(r.cadence) ? r.cadence : undefined,
    distanceM: isNum(r.distance) ? r.distance : undefined,
  };
}

type FitSession = {
  start_time?: string | Date;
  total_elapsed_time?: number;
  sport?: string;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_speed?: number;
  total_distance?: number;
  total_ascent?: number;
  avg_power?: number;
};

function fitSession(s: FitSession, allRecords: FitRecord[]): ParsedSession | null {
  const parsedStart = s.start_time ? new Date(s.start_time) : null;
  // A malformed start_time is an invalid Date; toISOString() on it throws, so
  // treat it as no start at all rather than let the module throw.
  const start =
    parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null;
  let records: SampleRecord[] = [];
  if (start) {
    const startMs = start.getTime();
    const endMs = s.total_elapsed_time
      ? startMs + s.total_elapsed_time * 1000
      : Infinity;
    records = allRecords
      .filter((r) => {
        const ts = r.timestamp ? new Date(r.timestamp).getTime() : NaN;
        return ts >= startMs && ts <= endMs;
      })
      .map((r) => normalizeFitRecord(r, startMs));
  }
  const computed = summarizeRecords(records);
  const date = start ? start.toISOString().slice(0, 10) : null;
  if (!date) return null;
  // The raw file label is bounded and kept only in the display-only `sport`
  // column (slice 16). The `note` is a *constant* provenance string, carrying
  // no file text: `note` is the one field a prompt could interpolate (the
  // Session Negotiation prompt does), and bounding cannot neutralise injection
  // prose — only keeping file text out of the note can. `sessionType` stays on
  // the raw value; its lookup is the injection defence there.
  const sport = boundFileText(s.sport);
  return {
    date,
    sessionType: inferSessionType(s.sport || ''),
    duration: s.total_elapsed_time ? Math.round(s.total_elapsed_time / 60) : null,
    note: 'Imported from Garmin',
    startTime: start ? start.toISOString() : null,
    sport,
    summary: {
      avgHr: numOr(s.avg_heart_rate, computed.avgHr),
      maxHr: numOr(s.max_heart_rate, computed.maxHr),
      avgSpeedMps: numOr(s.avg_speed, computed.avgSpeedMps),
      distanceM: numOr(s.total_distance, computed.distanceM),
      ascentM: numOr(s.total_ascent, computed.ascentM),
      avgPowerW: numOr(s.avg_power, computed.avgPowerW),
    },
    streams: downsampleRecords(records),
  };
}

/**
 * Why a FIT upload failed, in the terms the athlete needs to hear.
 *
 * One message for every failure is what turns a recoverable mistake into a dead
 * end for a tester who cannot ask (showable-version/06), so the parser reports
 * *which* failure it was and the copy says so.
 */
export type FitParseFailure = 'not-a-fit-file' | 'corrupt' | 'unreadable';

export type FitParseResult =
  | { ok: true; sessions: ParsedSession[] }
  | { ok: false; reason: FitParseFailure };

/** Bytes 8-11 of every FIT file, and the cheapest way to know this is not one. */
const FIT_MAGIC = '.FIT';

/** The two header lengths the FIT spec defines: 12 bytes, or 14 with a header CRC. */
const HEADER_SIZES = [12, 14];

/**
 * The FIT checksum, straight from the spec's reference implementation.
 *
 * This is CRC-16/ARC (the reflected 0xA001 polynomial), computed with the FIT
 * SDK's 16-entry nibble table — not a convention private to this repo.
 *
 * That distinction is load-bearing, because {@link inspectFitFile} now *refuses*
 * an upload whose checksum does not match. The fixture writes files with this
 * same function, so a round-trip test proves only that the two halves agree with
 * each other; if this implementation were subtly wrong it would reject every
 * real Garmin export and the fixture would never notice. The review raised
 * exactly that, so the algorithm is pinned to an external constant instead: the
 * published CRC-16/ARC check value, `0xBB3D` for the ASCII string "123456789"
 * (see `garmin.test.ts`). A file Garmin considers valid computes the same way
 * here.
 */
export function fitCrc(data: Buffer): number {
  const table = [
    0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001,
    0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
  ];
  let crc = 0;
  for (const byte of data) {
    let tmp = table[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ table[byte & 0xf];

    tmp = table[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ table[(byte >> 4) & 0xf];
  }
  return crc & 0xffff;
}

/**
 * Reads the FIT header and checksum before the decoder ever sees the buffer.
 *
 * This exists because `fit-file-parser` does not fail on input it cannot make
 * sense of — it simply never calls its callback, so the promise never settles
 * and a server action hangs until the platform kills it, with the athlete
 * watching a spinner (showable-version/06, found 2026-08-18). Renaming a `.txt`
 * is the ordinary way to reach that, and an unattended tester is exactly who
 * will do it.
 *
 * The checksum half is a separate decision (Mads, 2026-08-18): the parser runs
 * with `force: true`, which tolerates real-world quirks but also ignores the
 * CRC, so a file corrupted in transit used to decode into the training record
 * silently. The record is immutable once written, so a file that fails its own
 * checksum is refused rather than trusted.
 *
 * Returns the failure, or null when the bytes are a well-formed FIT file.
 */
export function inspectFitFile(buffer: Buffer): FitParseFailure | null {
  if (buffer.length < 12) return 'not-a-fit-file';

  const headerSize = buffer.readUInt8(0);
  if (!HEADER_SIZES.includes(headerSize)) return 'not-a-fit-file';
  if (buffer.length < headerSize) return 'not-a-fit-file';
  if (buffer.toString('ascii', 8, 12) !== FIT_MAGIC) return 'not-a-fit-file';

  // Past this point the file says it is FIT, so every remaining fault is damage
  // to a real file rather than the wrong file entirely — which is the
  // distinction the athlete-facing copy turns on.
  const dataSize = buffer.readUInt32LE(4);
  const expected = headerSize + dataSize + 2; // + the trailing file CRC
  if (buffer.length < expected) return 'corrupt';

  const stored = buffer.readUInt16LE(headerSize + dataSize);
  if (stored !== fitCrc(buffer.subarray(0, headerSize + dataSize))) return 'corrupt';

  return null;
}

/**
 * Decodes an uploaded FIT file into sessions.
 *
 * Validates the header and checksum first, then decodes with `force: true` —
 * tolerant of the field-level quirks a real Garmin export carries, since the
 * structural checks it would otherwise perform have already been made here,
 * deterministically and with a reason attached.
 *
 * **Why there is no timeout around the decode.** An earlier version wrapped this
 * in a 15-second `setTimeout`, described as the backstop that made the hang
 * "structurally impossible". It was inert, and the review caught it:
 * `FitParser.parse` is *fully synchronous* — every one of its callbacks, the
 * success path included, fires on the same tick — so the hang it was meant to
 * catch is a blocked event loop, and a blocked event loop is exactly what stops
 * a timer from running. A guard that cannot fire is worse than no guard, because
 * it stops anyone looking for a real one.
 *
 * What actually bounds the decode is {@link inspectFitFile}, and it does so
 * structurally rather than by enumerating bad inputs: the runaway is the
 * decoder's `while (loopIndex < crcStart)` loop, `crcStart` is
 * `headerSize + dataSize` read from the file's own header, and the check refuses
 * any file shorter than `headerSize + dataSize + 2`. So `crcStart` can never
 * exceed the bytes actually present, and the loop is bounded by the length of
 * the upload — which the platform already caps. A file that passes the header
 * check terminates.
 *
 * If the decode ever does need a real time bound, it has to run somewhere with
 * its own event loop — a worker thread — not behind a timer on this one.
 */
export function parseFit(buffer: Buffer): Promise<FitParseResult> {
  const problem = inspectFitFile(buffer);
  if (problem) return Promise.resolve({ ok: false, reason: problem });

  return new Promise((resolve) => {
    // `force: true` makes the decoder report a structural complaint and then
    // carry on regardless, so it genuinely can call back twice — once to object
    // and once with the data. First result wins; the rest are dropped.
    let settled = false;
    const finish = (result: FitParseResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const parser = new FitParser({ force: true, mode: 'list' });
    try {
      // Cast around a @types/node quirk: the parser types the argument as
      // Buffer<ArrayBuffer>, while a plain Buffer is Buffer<ArrayBufferLike>.
      // Same value at runtime.
      parser.parse(buffer as Buffer<ArrayBuffer>, (error: unknown, data: unknown) => {
        if (error || !data) return finish({ ok: false, reason: 'unreadable' });
        const d = data as {
          activity?: { sessions?: FitSession[]; records?: FitRecord[] };
          sessions?: FitSession[];
          records?: FitRecord[];
        };
        const sessions = d.activity?.sessions || d.sessions || [];
        const allRecords = d.records || d.activity?.records || [];
        finish({
          ok: true,
          sessions: sessions
            .map((s) => fitSession(s, allRecords))
            .filter((s): s is ParsedSession => s !== null),
        });
      });
    } catch {
      // The decoder throws synchronously on shapes its own guards miss. Since
      // `parse` runs on this tick, that throw would otherwise escape the
      // executor and reject the promise — and no caller catches it.
      finish({ ok: false, reason: 'unreadable' });
    }
  });
}

// ── GPX ───────────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type GpxPoint = {
  time?: string;
  ele?: string | number;
  '@_lat'?: string | number;
  '@_lon'?: string | number;
  extensions?: Record<string, unknown>;
};

/**
 * Heart rate hides in a namespaced TrackPointExtension (gpxtpx:, ns3:, …) —
 * match the local names, not the prefix.
 */
function gpxHr(p: GpxPoint): number | undefined {
  const ext = p.extensions;
  if (!ext || typeof ext !== 'object') return undefined;
  for (const [key, val] of Object.entries(ext)) {
    if (/TrackPointExtension$/i.test(key) && val && typeof val === 'object') {
      for (const [k2, v2] of Object.entries(val as Record<string, unknown>)) {
        if (/(^|:)hr$/i.test(k2)) {
          const n = Number(v2);
          if (Number.isFinite(n)) return n;
        }
      }
    }
  }
  return undefined;
}

function gpxRecords(points: GpxPoint[], startMs: number): SampleRecord[] {
  const records: SampleRecord[] = [];
  let cumDist = 0;
  let prev: { ts: number; lat: number; lon: number } | null = null;
  for (const p of points) {
    if (!p.time) continue;
    const ts = new Date(p.time).getTime();
    if (!Number.isFinite(ts)) continue;
    const rec: SampleRecord = { t: (ts - startMs) / 1000 };
    const ele = Number(p.ele);
    if (Number.isFinite(ele)) rec.altM = ele;
    const hr = gpxHr(p);
    if (hr !== undefined) rec.hr = hr;
    const lat = Number(p['@_lat']);
    const lon = Number(p['@_lon']);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      if (prev) {
        const dt = (ts - prev.ts) / 1000;
        const seg = haversineM(prev.lat, prev.lon, lat, lon);
        cumDist += seg;
        if (dt > 0) rec.speedMps = seg / dt;
      }
      rec.distanceM = cumDist;
      prev = { ts, lat, lon };
    }
    records.push(rec);
  }
  return records;
}

export function parseGpx(buffer: Buffer): ParsedSession[] {
  const xml = buffer.toString('utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let gpx: { gpx?: { trk?: unknown } };
  try {
    gpx = parser.parse(xml);
  } catch {
    return [];
  }
  const tracks = gpx?.gpx?.trk;
  const list = Array.isArray(tracks) ? tracks : tracks ? [tracks] : [];
  return list
    .map((trk: Record<string, unknown>) => {
      const segments = ([] as unknown[]).concat(trk.trkseg || []);
      const points = segments.flatMap((seg) =>
        ([] as GpxPoint[]).concat((seg as { trkpt?: GpxPoint | GpxPoint[] }).trkpt || []),
      );
      const times = points.map((p) => p.time).filter(Boolean) as string[];
      // Derive everything from the parsed epoch, which is NaN for a malformed
      // <time>. toISOString() on an invalid Date throws, so guard on a finite
      // firstTs rather than call it on a raw string — the module never throws.
      const firstTs = times.length > 0 ? new Date(times[0]).getTime() : 0;
      const lastTs = times.length > 0 ? new Date(times[times.length - 1]).getTime() : 0;
      const hasStart = Number.isFinite(firstTs) && firstTs > 0;
      const date = hasStart ? new Date(firstTs).toISOString().slice(0, 10) : null;
      const duration =
        hasStart && Number.isFinite(lastTs) && lastTs > 0
          ? Math.round((lastTs - firstTs) / 60000)
          : null;
      // A valid GPX can nest `<type>`/`<name>` as an element, so the parser
      // yields an object, not a string — take a string or fall back to '', so
      // the parser keeps its never-throws contract.
      const typeName =
        typeof trk.type === 'string'
          ? trk.type
          : typeof trk.name === 'string'
            ? trk.name
            : '';
      // Bounded label to the display-only column; the note is constant (see the
      // FIT path — file text never rides the note into a prompt).
      const sport = boundFileText(typeName);
      const records = firstTs ? gpxRecords(points, firstTs) : [];
      return {
        date,
        sessionType: inferSessionType(typeName),
        duration,
        note: 'Imported from GPX',
        startTime: hasStart ? new Date(firstTs).toISOString() : null,
        sport,
        summary: summarizeRecords(records),
        streams: downsampleRecords(records),
      };
    })
    .filter((s): s is ParsedSession => s.date !== null);
}
