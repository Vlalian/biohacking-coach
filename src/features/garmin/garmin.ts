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

export function inferSessionType(sport = ''): string {
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
export function boundFileText(value: string | null | undefined): string | null {
  if (value == null) return null;
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

export function parseFit(buffer: Buffer): Promise<ParsedSession[]> {
  return new Promise((resolve) => {
    const parser = new FitParser({ force: true, mode: 'list' });
    // Cast around a @types/node quirk: the parser types the argument as
    // Buffer<ArrayBuffer>, while a plain Buffer is Buffer<ArrayBufferLike>. Same
    // value at runtime.
    parser.parse(buffer as Buffer<ArrayBuffer>, (error: unknown, data: unknown) => {
      if (error || !data) return resolve([]);
      const d = data as {
        activity?: { sessions?: FitSession[]; records?: FitRecord[] };
        sessions?: FitSession[];
        records?: FitRecord[];
      };
      const sessions = d.activity?.sessions || d.sessions || [];
      const allRecords = d.records || d.activity?.records || [];
      resolve(
        sessions
          .map((s) => fitSession(s, allRecords))
          .filter((s): s is ParsedSession => s !== null),
      );
    });
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
      const typeName = (trk.type || trk.name || '') as string;
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
