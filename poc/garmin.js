// Garmin file ingestion — FIT/GPX parsing for /api/garmin/upload.
// Stateless: buffers in, plain session objects out. Nothing is persisted here;
// streams live on-device (Privacy Proxy architecture). The stream format below
// (columnar arrays, 10 s bins) is the contract the future calc module consumes.

const FitParser = require('fit-file-parser').default;
const { XMLParser } = require('fast-xml-parser');

const SPORT_MAP = {
  running: 'Endurance', cycling: 'Endurance', swimming: 'Endurance',
  triathlon: 'Endurance', open_water: 'Endurance', rowing: 'Endurance',
  strength_training: 'Strength', training: 'Strength',
};

function inferSessionType(sport = '') {
  return SPORT_MAP[sport.toLowerCase()] || 'Endurance';
}

// ── Stream building ───────────────────────────────────────────────────────────
// Internal normalized record: { t, hr, speedMps, altM, powerW, cadenceRpm, distanceM }
// where t = seconds since activity start and absent channels are undefined.

const BIN_SECONDS = 10;
const STREAM_CHANNELS = ['hr', 'speedMps', 'altM', 'powerW', 'cadenceRpm'];

function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Columnar streams at BIN_SECONDS resolution: { t, <channel>... }. Mean per bin.
// Channels with no samples anywhere are omitted entirely (never null-filled arrays);
// a bin missing samples for a present channel yields null at that index.
function downsampleRecords(records) {
  const bins = new Map();
  for (const r of records || []) {
    if (!isNum(r.t) || r.t < 0) continue;
    const bin = Math.floor(r.t / BIN_SECONDS) * BIN_SECONDS;
    if (!bins.has(bin)) bins.set(bin, {});
    const acc = bins.get(bin);
    for (const ch of STREAM_CHANNELS) {
      if (isNum(r[ch])) (acc[ch] || (acc[ch] = [])).push(r[ch]);
    }
  }
  const t = [...bins.keys()].sort((a, b) => a - b);
  const streams = { t };
  for (const ch of STREAM_CHANNELS) {
    if (!t.some(bin => bins.get(bin)[ch])) continue;
    streams[ch] = t.map(bin => {
      const vals = bins.get(bin)[ch];
      return vals ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    });
  }
  return streams;
}

// Per-workout summary computed from records; null where the channel is absent.
function summarizeRecords(records) {
  const chan = ch => (records || []).map(r => r[ch]).filter(isNum);
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const hr = chan('hr');
  const alt = chan('altM');
  const dist = chan('distanceM');
  let ascent = null;
  if (alt.length > 1) {
    ascent = 0;
    for (let i = 1; i < alt.length; i++) {
      const d = alt[i] - alt[i - 1];
      if (d > 0) ascent += d;
    }
  }
  return {
    avgHr:       round2(mean(hr)),
    maxHr:       hr.length ? hr.reduce((a, b) => Math.max(a, b), -Infinity) : null,
    avgSpeedMps: round2(mean(chan('speedMps'))),
    distanceM:   dist.length > 1 ? round2(dist[dist.length - 1] - dist[0]) : null,
    ascentM:     round2(ascent),
    avgPowerW:   round2(mean(chan('powerW'))),
  };
}

function numOr(v, fallback) {
  return isNum(v) ? round2(v) : (fallback != null ? fallback : null);
}

// ── FIT ───────────────────────────────────────────────────────────────────────

function normalizeFitRecord(r, startMs) {
  const ts = r.timestamp ? new Date(r.timestamp).getTime() : NaN;
  return {
    t:          (ts - startMs) / 1000,
    hr:         isNum(r.heart_rate) ? r.heart_rate : undefined,
    speedMps:   isNum(r.speed) ? r.speed : undefined,
    altM:       isNum(r.altitude) ? r.altitude : undefined,
    powerW:     isNum(r.power) ? r.power : undefined,
    cadenceRpm: isNum(r.cadence) ? r.cadence : undefined,
    distanceM:  isNum(r.distance) ? r.distance : undefined,
  };
}

function fitSession(s, allRecords) {
  const start = s.start_time ? new Date(s.start_time) : null;
  let records = [];
  if (start) {
    const startMs = start.getTime();
    const endMs = s.total_elapsed_time ? startMs + s.total_elapsed_time * 1000 : Infinity;
    records = allRecords
      .filter(r => {
        const ts = r.timestamp ? new Date(r.timestamp).getTime() : NaN;
        return ts >= startMs && ts <= endMs;
      })
      .map(r => normalizeFitRecord(r, startMs));
  }
  const computed = summarizeRecords(records);
  return {
    date:        start ? start.toISOString().slice(0, 10) : null,
    sessionType: inferSessionType(s.sport || ''),
    duration:    s.total_elapsed_time ? Math.round(s.total_elapsed_time / 60) : null,
    body:        null,
    mind:        null,
    note:        `Imported from Garmin${s.sport ? ' · ' + s.sport : ''}`,
    startTime:   start ? start.toISOString() : null,
    sport:       s.sport || null,
    summary: {
      avgHr:       numOr(s.avg_heart_rate, computed.avgHr),
      maxHr:       numOr(s.max_heart_rate, computed.maxHr),
      avgSpeedMps: numOr(s.avg_speed, computed.avgSpeedMps),
      distanceM:   numOr(s.total_distance, computed.distanceM),
      ascentM:     numOr(s.total_ascent, computed.ascentM),
      avgPowerW:   numOr(s.avg_power, computed.avgPowerW),
    },
    streams: downsampleRecords(records),
  };
}

function parseFit(buffer) {
  return new Promise((resolve) => {
    const parser = new FitParser({ force: true, mode: 'list' });
    parser.parse(buffer, (error, data) => {
      if (error || !data) return resolve([]);
      const sessions   = data.activity?.sessions || data.sessions || [];
      const allRecords = data.records || data.activity?.records || [];
      resolve(sessions.map(s => fitSession(s, allRecords)).filter(s => s.date));
    });
  });
}

// ── GPX ───────────────────────────────────────────────────────────────────────

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Heart rate hides in a namespaced TrackPointExtension (gpxtpx:, ns3:, …) —
// match the local names, not the prefix.
function gpxHr(p) {
  const ext = p.extensions;
  if (!ext || typeof ext !== 'object') return undefined;
  for (const [key, val] of Object.entries(ext)) {
    if (/TrackPointExtension$/i.test(key) && val && typeof val === 'object') {
      for (const [k2, v2] of Object.entries(val)) {
        if (/(^|:)hr$/i.test(k2)) {
          const n = Number(v2);
          if (Number.isFinite(n)) return n;
        }
      }
    }
  }
  return undefined;
}

function gpxRecords(points, startMs) {
  const records = [];
  let cumDist = 0;
  let prev = null;
  for (const p of points) {
    if (!p.time) continue;
    const ts = new Date(p.time).getTime();
    if (!Number.isFinite(ts)) continue;
    const rec = { t: (ts - startMs) / 1000 };
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

function parseGpx(buffer) {
  const xml = buffer.toString('utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let gpx;
  try { gpx = parser.parse(xml); } catch { return []; }
  const tracks = gpx?.gpx?.trk;
  const list   = Array.isArray(tracks) ? tracks : tracks ? [tracks] : [];
  return list.map(trk => {
    const segments = [].concat(trk.trkseg || []);
    const points   = segments.flatMap(seg => [].concat(seg.trkpt || []));
    const times    = points.map(p => p.time).filter(Boolean);
    const date     = times.length > 0 ? new Date(times[0]).toISOString().slice(0, 10) : null;
    const firstTs  = times.length > 0 ? new Date(times[0]).getTime() : 0;
    const lastTs   = times.length > 0 ? new Date(times[times.length - 1]).getTime() : 0;
    const duration = firstTs && lastTs ? Math.round((lastTs - firstTs) / 60000) : null;
    const typeName = trk.type || trk.name || '';
    const records  = firstTs ? gpxRecords(points, firstTs) : [];
    return {
      date,
      sessionType: inferSessionType(typeName),
      duration,
      body: null,
      mind: null,
      note: `Imported from GPX${typeName ? ' · ' + typeName : ''}`,
      startTime: firstTs ? new Date(firstTs).toISOString() : null,
      sport: typeName || null,
      summary: summarizeRecords(records),
      streams: downsampleRecords(records),
    };
  }).filter(s => s.date);
}

module.exports = { parseFit, parseGpx, inferSessionType, downsampleRecords, summarizeRecords };
