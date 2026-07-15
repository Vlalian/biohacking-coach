// @vitest-environment jsdom
// The 'mine' dataset state — real data from the entity store and streams
// (issue gs-04). Same shape as the synthetic states; TSS-family values null.

import { describe, it, expect, beforeEach } from 'vitest';
import { getDataset, emptyDataset, hasMineData, windowDataset } from '../public/js/infodata.js';
import { availablePanels } from '../public/js/panels.js';
import { importParsedSessions } from '../public/js/garmin-import.js';
import { createSession, updateSession } from '../public/js/store.js';

const TODAY = '2026-07-15';

beforeEach(() => {
  localStorage.clear();
});

// A 30-min ride with HR + power streams, 8 days ago (previous week).
function parsedRide(overrides = {}) {
  const n = 180; // 180 bins × 10 s = 30 min
  return {
    date: '2026-07-07', sessionType: 'Endurance', duration: 30,
    body: null, mind: null, note: 'Imported from Garmin · cycling',
    startTime: '2026-07-07T08:00:00.000Z', sport: 'cycling',
    summary: { avgHr: 141, maxHr: 172, avgSpeedMps: 8.2, distanceM: 15000, ascentM: 120, avgPowerW: 180 },
    streams: {
      t: Array.from({ length: n }, (_, i) => i * 10),
      hr: Array.from({ length: n }, (_, i) => 120 + (i % 50)),
      powerW: Array.from({ length: n }, (_, i) => 150 + (i % 80)),
    },
    ...overrides,
  };
}

function hrOnlyRun(overrides = {}) {
  const n = 90;
  return {
    date: '2026-07-13', sessionType: 'Endurance', duration: 15,
    body: null, mind: null, note: 'Imported from Garmin · running',
    startTime: '2026-07-13T07:00:00.000Z', sport: 'running',
    summary: { avgHr: 150, maxHr: 176, avgSpeedMps: 3.2, distanceM: 2900, ascentM: 12, avgPowerW: null },
    streams: {
      t: Array.from({ length: n }, (_, i) => i * 10),
      hr: Array.from({ length: n }, (_, i) => 135 + (i % 40)),
    },
    ...overrides,
  };
}

describe("getDataset('mine') — shape and emptiness", () => {
  it('matches the canonical dataset shape on an empty store', () => {
    const D = getDataset('mine', { today: TODAY });
    expect(Object.keys(D).sort()).toEqual(Object.keys(emptyDataset()).sort());
    expect(D.kind).toBe('mine');
    expect(D.sessions).toEqual([]);
    expect(D.weekly).toEqual([]);
    expect(D.weeksToRace).toBeNull();
  });

  it('hasMineData flips once an import exists', () => {
    expect(hasMineData()).toBe(false);
    importParsedSessions([parsedRide()]);
    expect(hasMineData()).toBe(true);
  });
});

describe("getDataset('mine') — built from real entities", () => {
  it('maps an imported workout to a session with real values and null TSS', () => {
    importParsedSessions([parsedRide()]);
    const D = getDataset('mine', { today: TODAY });

    expect(D.sessions).toHaveLength(1);
    const s = D.sessions[0];
    expect(s.date).toBe('2026-07-07');
    expect(s.week).toBe(1);              // previous Mon–Sun week
    expect(s.sport).toBe('bike');
    expect(s.durMin).toBe(30);
    expect(s.km).toBe(15);
    expect(s.hr).toBe(141);
    expect(s.power).toBe(180);
    expect(s.kj).toBe(Math.round((180 * 30 * 60) / 1000));
    expect(s.tss).toBeNull();
    expect(s.status).toBe('done');
  });

  it('weekly aggregates are oldest → newest with null fitness/fatigue/form/tss', () => {
    importParsedSessions([parsedRide(), hrOnlyRun()]);
    const D = getDataset('mine', { today: TODAY });

    expect(D.weekly).toHaveLength(2);
    expect(D.weekly[0].week).toBe(1);    // oldest first
    expect(D.weekly[1].week).toBe(0);
    expect(D.weekly[0].min).toBe(30);
    expect(D.weekly[1].min).toBe(15);
    for (const w of D.weekly) {
      expect(w.tss).toBeNull();
      expect(w.fitness).toBeNull();
      expect(w.form).toBeNull();
    }
  });

  it('maps smiley feedback (1–5) onto the 1–10 panel axis', () => {
    const { imported } = importParsedSessions([parsedRide()]);
    updateSession(imported[0].id, { feedback: { body: 4, mind: 5, comment: 'Strong.' } });
    const D = getDataset('mine', { today: TODAY });
    expect(D.sessions[0].body).toBe(8);
    expect(D.sessions[0].mind).toBe(10);
    expect(D.sessions[0].comment).toBe('Strong.');
  });

  it('planned and future sessions stay out of the dataset', () => {
    importParsedSessions([parsedRide()]);
    createSession({ dateKey: '2026-07-14', type: 'Endurance', status: 'planned' });
    createSession({ dateKey: '2026-07-20', type: 'Tempo', status: 'planned' });
    const D = getDataset('mine', { today: TODAY });
    expect(D.sessions).toHaveLength(1);
  });
});

describe("getDataset('mine') — wearable-gated collections", () => {
  it('HR + power upload populates zones, both peak tables, and bests', () => {
    importParsedSessions([parsedRide()]);
    const D = getDataset('mine', { today: TODAY });

    const week = D.weekly.find(w => w.week === 1);
    expect(week.zones).not.toBeNull();
    expect(week.zones.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(99); // ~100%
    expect(D.peaksPower).toHaveLength(1);
    expect(D.peaksPower[0].label).toBe('Jul');
    expect(D.peaksPower[0]['5m']).toBeGreaterThan(0);
    expect(D.peaksHr).toHaveLength(1);
    expect(D.bests.some(b => b.metricKey === 'infoBestPower5s')).toBe(true);
  });

  it('an HR-only upload leaves power-gated collections empty', () => {
    importParsedSessions([hrOnlyRun()]);
    const D = getDataset('mine', { today: TODAY });

    expect(D.peaksHr).toHaveLength(1);
    expect(D.peaksPower).toHaveLength(0);
    expect(D.bests.some(b => b.metricKey.startsWith('infoBestPower'))).toBe(false);
    expect(D.bests.some(b => b.metricKey === 'infoBestHr5s')).toBe(true);
    expect(D.weekly.find(w => w.week === 0).kj).toBeNull();
  });

  it('peak windows longer than the recording are absent, not zero', () => {
    importParsedSessions([hrOnlyRun()]); // 15 min: 20m and 60m windows impossible
    const D = getDataset('mine', { today: TODAY });
    expect(D.peaksHr[0]['5m']).toBeGreaterThan(0);
    expect(D.peaksHr[0]['20m']).toBeUndefined();
    expect(D.peaksHr[0]['60m']).toBeUndefined();
  });
});

describe("panel gating on 'mine'", () => {
  it('TSS-derived panels stay unrendered; volume and wearable panels light up', () => {
    importParsedSessions([parsedRide()]);
    const ids = availablePanels(getDataset('mine', { today: TODAY })).map(p => p.id);

    for (const gated of ['ffnow', 'load', 'ramp']) expect(ids).not.toContain(gated);
    for (const lit of ['hours', 'longest', 'split-dur', 'zones', 'peaks-power', 'peaks-hr', 'bests', 'work']) {
      expect(ids).toContain(lit);
    }
  });

  it('synthetic states keep their panels after the gate tightening', () => {
    const ids = availablePanels(getDataset('rich', { today: TODAY })).map(p => p.id);
    for (const id of ['ffnow', 'load', 'ramp']) expect(ids).toContain(id);
  });

  it('windowing works on mine: r4 keeps both weeks, sessions intact', () => {
    importParsedSessions([parsedRide(), hrOnlyRun()]);
    const D = windowDataset(getDataset('mine', { today: TODAY }), 4);
    expect(D.weekly).toHaveLength(2);
    expect(D.sessions).toHaveLength(2);
  });
});
