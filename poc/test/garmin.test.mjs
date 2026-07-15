// Garmin ingestion — pure stream functions + the upload endpoint end-to-end.
// FIT is covered at the record-mapping seam (synthetic record arrays); authoring
// a binary FIT fixture is not worth it. GPX is text, so it runs through the
// whole endpoint. All fixture values are synthetic (privacy rule 2026-07-09).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { downsampleRecords, summarizeRecords } from '../garmin.js';
import { app } from '../server.js';

// ── downsampleRecords ─────────────────────────────────────────────────────────

describe('downsampleRecords', () => {
  it('returns empty t and no channels for empty or missing input', () => {
    expect(downsampleRecords([])).toEqual({ t: [] });
    expect(downsampleRecords()).toEqual({ t: [] });
  });

  it('bins records into 10 s buckets with per-bin means', () => {
    const records = [
      { t: 0,  hr: 100 },
      { t: 5,  hr: 110 },
      { t: 10, hr: 120 },
      { t: 15, hr: 130 },
    ];
    expect(downsampleRecords(records)).toEqual({ t: [0, 10], hr: [105, 125] });
  });

  it('omits channels with no samples anywhere', () => {
    const streams = downsampleRecords([{ t: 0, hr: 100 }]);
    expect(streams).toEqual({ t: [0], hr: [100] });
    expect(streams).not.toHaveProperty('speedMps');
    expect(streams).not.toHaveProperty('powerW');
  });

  it('fills null for bins missing a present channel', () => {
    const records = [
      { t: 0,  hr: 100, powerW: 200 },
      { t: 12, hr: 102 },
    ];
    expect(downsampleRecords(records)).toEqual({
      t: [0, 10], hr: [100, 102], powerW: [200, null],
    });
  });

  it('keeps t monotonic even from unordered records and drops negative t', () => {
    const records = [
      { t: 25, hr: 130 },
      { t: -4, hr: 999 },
      { t: 3,  hr: 100 },
    ];
    expect(downsampleRecords(records)).toEqual({ t: [0, 20], hr: [100, 130] });
  });
});

// ── summarizeRecords ──────────────────────────────────────────────────────────

describe('summarizeRecords', () => {
  it('is all-null on empty input', () => {
    expect(summarizeRecords([])).toEqual({
      avgHr: null, maxHr: null, avgSpeedMps: null,
      distanceM: null, ascentM: null, avgPowerW: null,
    });
  });

  it('computes avg/max hr, ascent from positive deltas only, distance last minus first', () => {
    const records = [
      { t: 0,  hr: 100, altM: 10, distanceM: 0 },
      { t: 10, hr: 140, altM: 14, distanceM: 50 },
      { t: 20, hr: 120, altM: 12, distanceM: 90 },
    ];
    const s = summarizeRecords(records);
    expect(s.avgHr).toBe(120);
    expect(s.maxHr).toBe(140);
    expect(s.ascentM).toBe(4);       // only the +4 climb counts, not the -2 descent
    expect(s.distanceM).toBe(90);
    expect(s.avgPowerW).toBeNull();
  });

  it('handles a single record without NaN: distance and ascent need two points', () => {
    const s = summarizeRecords([{ t: 0, hr: 100, altM: 10, distanceM: 500 }]);
    expect(s.avgHr).toBe(100);
    expect(s.distanceM).toBeNull();
    expect(s.ascentM).toBeNull();
  });
});

// ── /api/garmin/upload end-to-end (GPX) ──────────────────────────────────────

// Recent date so the six-month cutoff keeps the session.
const DAY = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);

function gpxPoint(i) {
  // 10 s apart, ~11 m per step northward, gentle climb, rising HR.
  const sec = String(i * 10).padStart(2, '0');
  return `<trkpt lat="${(55 + i * 0.0001).toFixed(4)}" lon="12.0000">
    <ele>${10 + i}</ele>
    <time>${DAY}T08:00:${sec}Z</time>
    <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${120 + i}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
  </trkpt>`;
}

const GPX_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="synthetic-fixture" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Morning Run</name><type>running</type><trkseg>
    ${[0, 1, 2, 3, 4, 5].map(gpxPoint).join('\n')}
  </trkseg></trk>
</gpx>`;

describe('POST /api/garmin/upload', () => {
  let server, base;

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise(r => server.close(r)));

  async function uploadGpx() {
    const fd = new FormData();
    fd.append('files', new Blob([GPX_FIXTURE], { type: 'application/gpx+xml' }), 'run.gpx');
    const res = await fetch(`${base}/api/garmin/upload`, { method: 'POST', body: fd });
    return { status: res.status, json: await res.json() };
  }

  it('returns the session with all pre-existing fields intact', async () => {
    const { status, json } = await uploadGpx();
    expect(status).toBe(200);
    expect(json.sessions).toHaveLength(1);
    const s = json.sessions[0];
    expect(s.date).toBe(DAY);
    expect(s.sessionType).toBe('Endurance');
    expect(s.duration).toBe(1); // 50 s rounds to 1 min
    expect(s.body).toBeNull();
    expect(s.mind).toBeNull();
    expect(s.note).toContain('Imported from GPX');
  });

  it('carries startTime, summary, and 10 s streams', async () => {
    const { json } = await uploadGpx();
    const s = json.sessions[0];
    expect(s.startTime).toBe(`${DAY}T08:00:00.000Z`);
    expect(s.sport).toBe('running');

    // 6 points at 10 s spacing → bins 0..50, one point each.
    expect(s.streams.t).toEqual([0, 10, 20, 30, 40, 50]);
    expect(s.streams.hr).toEqual([120, 121, 122, 123, 124, 125]);
    expect(s.streams.altM).toEqual([10, 11, 12, 13, 14, 15]);
    // Speed derives from consecutive points, so the first bin has no sample.
    expect(s.streams.speedMps[0]).toBeNull();
    expect(s.streams.speedMps[1]).toBeGreaterThan(0.9);
    expect(s.streams.speedMps[1]).toBeLessThan(1.4);
    // GPX carries no power/cadence — channels absent, not null-filled.
    expect(s.streams).not.toHaveProperty('powerW');
    expect(s.streams).not.toHaveProperty('cadenceRpm');

    expect(s.summary.avgHr).toBe(122.5);
    expect(s.summary.maxHr).toBe(125);
    expect(s.summary.ascentM).toBe(5);
    expect(s.summary.distanceM).toBeGreaterThan(45);
    expect(s.summary.distanceM).toBeLessThan(70);
    expect(s.summary.avgPowerW).toBeNull();
  });

  it('rejects an empty upload', async () => {
    const fd = new FormData();
    const res = await fetch(`${base}/api/garmin/upload`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });
});
