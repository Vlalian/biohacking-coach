// Synthetic data provider for the Information View.
//
// The seam where real data sources (entity store, wearables) plug in later —
// nothing outside this module may fabricate Information View data. Exposes
// named dataset states: 'fresh' (week 1) and 'rich' (26 weeks). Deterministic:
// seeded PRNG, so the same state (and reference date) always yields the same
// dataset. All values are synthetic — the 2026-07-09 privacy rule applies to
// fixtures as much as to docs.

import { allSessions, getStreams, weekStartOf, getDateKey } from './store.js';

const SPORTS = ['swim', 'bike', 'run'];

const TITLES = {
  swim: ['Cottonwill Set', 'CSS Intervals', 'Open Water Prep', 'Drill & Pull'],
  bike: ['ME & AE Ride', 'VO2 Max Bike', 'Over-Unders', 'Long Zone 2', 'Speed Skills'],
  run:  ['Endurance Run', 'Mona Fartlek', 'Brick Run', 'Easy Run + Pick-ups', 'Tempo Run'],
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// PRNG demo states; 'mine' (real data from the store) joins them as a valid
// state but needs browser storage — node tests loop SYNTHETIC_STATES only.
export const SYNTHETIC_STATES = ['fresh', 'rich'];
export const DATASET_STATES = [...SYNTHETIC_STATES, 'mine'];

// The canonical (empty) dataset shape. Panel predicates and renderers may
// rely on every key existing; tests build one-reading datasets from this.
export function emptyDataset() {
  return {
    kind: 'empty',
    sessions: [],    // { id, date, week, title, sport, type, durMin, km, tss, power, hr, kj, body, mind, comment, status }
    weekly: [],      // { week, tss, min, kj, done, skipped, fitness, fatigue, form, zones[5], longest } oldest → newest
    checkins: [],    // { week, energy, sleepq, mood, motivation } oldest → newest
    sleep: [],       // { day, hours, feeling } oldest → newest
    peaksPower: [],  // { label, '5s', '1m', '5m', '20m', '60m' }
    peaksHr: [],
    bests: [],       // { date, week, metricKey, value, sport } newest first (issue 09)
    weeksToRace: null,
    raceName: '',
  };
}

export function getDataset(state, { today } = {}) {
  if (!DATASET_STATES.includes(state)) throw new Error(`Unknown dataset state: ${state}`);
  const ref = today ? new Date(today) : new Date();
  if (state === 'mine') return buildMineDataset(ref);
  const rnd = mulberry32(state === 'rich' ? 42 : 7);
  const weeks = state === 'rich' ? 26 : 1;
  const D = emptyDataset();
  D.kind = state;
  D.weeksToRace = state === 'rich' ? 8 : 24;
  D.raceName = 'Assundman 70.3';

  let fitness = state === 'rich' ? 30 : 0;
  let fatigue = state === 'rich' ? 30 : 0;

  for (let w = weeks - 1; w >= 0; w--) {
    const phaseRamp = 1 + 0.35 * (1 - w / weeks); // load builds over the block
    const recovery  = state === 'rich' && (weeks - w) % 4 === 0; // every 4th week easier
    const planned   = state === 'rich' ? 5 + Math.floor(rnd() * 2) : 3;
    let weekTss = 0, weekMin = 0, weekKj = 0, done = 0, skipped = 0;

    for (let s = 0; s < planned; s++) {
      const dayOffset = w * 7 + (6 - Math.floor(rnd() * 7));
      const d = new Date(ref); d.setDate(d.getDate() - dayOffset);
      if (d > ref) continue;
      const sport = SPORTS[Math.floor(rnd() * 3)];
      const type  = recovery ? 'Recovery'
        : ['Endurance', 'Endurance', 'Intensity', 'Tempo', 'Recovery'][Math.floor(rnd() * 5)];
      const durMin = Math.round((type === 'Endurance' ? 70 + rnd() * 80 : 40 + rnd() * 45) * (recovery ? 0.6 : phaseRamp));
      const isSkipped = state === 'rich' && rnd() < 0.12;
      const tss = Math.round(durMin * (type === 'Intensity' ? 1.05 : type === 'Tempo' ? 0.85 : type === 'Recovery' ? 0.45 : 0.65));
      const km  = sport === 'swim' ? +(durMin / 30).toFixed(1) : sport === 'bike' ? Math.round(durMin * 0.48) : +(durMin / 5.6).toFixed(1);
      const sess = {
        id: `s${w}-${s}`, date: d.toISOString().slice(0, 10), week: w,
        title: TITLES[sport][Math.floor(rnd() * TITLES[sport].length)],
        sport, type, durMin, km, tss,
        power: sport === 'bike' && state === 'rich' ? Math.round(150 + 60 * (1 - w / weeks) + rnd() * 25) : null,
        hr:    state === 'rich' ? Math.round(128 + (type === 'Intensity' ? 25 : 8) + rnd() * 12) : null,
        kj:    sport === 'bike' ? Math.round(durMin * 9) : null,
        body: null, mind: null, comment: '',
        status: isSkipped ? 'skipped' : 'done',
      };
      if (!isSkipped) {
        // Body dips in heavy weeks; mind dips on intensity sessions.
        sess.body = Math.max(1, Math.min(10, Math.round(7 - (phaseRamp - 1) * 5 + rnd() * 3 - (recovery ? -1 : 0))));
        sess.mind = Math.max(1, Math.min(10, Math.round(7.5 - (type === 'Intensity' ? 1.5 : 0) + rnd() * 2.5)));
        if (rnd() < 0.2) sess.comment = ['Felt strong.', 'Legs heavy from yesterday.', '60g carbs/h, worked well.', 'Cut short — time.'][Math.floor(rnd() * 4)];
        done++; weekTss += sess.tss; weekMin += durMin; weekKj += sess.kj || 0;
      } else skipped++;
      D.sessions.push(sess);
    }

    fitness = fitness + (weekTss / 7 - fitness) * 0.13;
    fatigue = fatigue + (weekTss / 7 - fatigue) * 0.38;
    D.weekly.push({
      week: w, tss: weekTss, min: weekMin, kj: weekKj, done, skipped,
      fitness: Math.round(fitness), fatigue: Math.round(fatigue),
      form: Math.round(fitness - fatigue),
      // Zone distribution is wearable-derived: null in 'fresh' (no strap data yet).
      zones: state !== 'rich' ? null : recovery ? [55, 30, 10, 4, 1] : [38, 27, 17, 12, 6], // % z1..z5
      longest: Math.max(0, ...D.sessions.filter(x => x.week === w && x.status === 'done').map(x => x.durMin)),
    });

    D.checkins.push({
      week: w,
      energy:     Math.max(1, Math.min(10, Math.round(7 - (phaseRamp - 1) * 6 + rnd() * 3))),
      sleepq:     Math.max(1, Math.min(10, Math.round(6.5 + rnd() * 3 - (phaseRamp - 1) * 3))),
      mood:       Math.max(1, Math.min(10, Math.round(7 + rnd() * 2.5 - (phaseRamp - 1) * 2))),
      motivation: Math.max(1, Math.min(10, Math.round(8 - (weeks - w) * 0.05 + rnd() * 2))),
    });
  }

  const sleepDays = state === 'rich' ? 30 : 4;
  for (let i = sleepDays - 1; i >= 0; i--) {
    D.sleep.push({ day: i, hours: +(5.8 + rnd() * 2.6).toFixed(1), feeling: Math.ceil(rnd() * 5) });
  }

  if (state === 'rich') {
    // Wearable-dependent bests: absent in 'fresh' (no power meter / strap yet).
    const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    months.forEach((m, i) => {
      const g = i / months.length;
      D.peaksPower.push({ label: m, '5s': Math.round(680 + g * 190 + rnd() * 30), '1m': Math.round(340 + g * 80 + rnd() * 20), '5m': Math.round(255 + g * 50 + rnd() * 15), '20m': Math.round(215 + g * 40 + rnd() * 10), '60m': Math.round(190 + g * 35 + rnd() * 10) });
      D.peaksHr.push({ label: m, '5s': Math.round(186 + rnd() * 8), '1m': Math.round(180 + rnd() * 6), '5m': Math.round(174 + rnd() * 5), '20m': Math.round(168 + rnd() * 5), '60m': Math.round(160 + rnd() * 5) });
    });

    // Recent personal bests — dated PB events, newest first.
    const BEST_KINDS = [
      ['infoBestPower5s', 'bike', v => `${Math.round(820 + v * 60)} W`],
      ['infoBestPower1m', 'bike', v => `${Math.round(400 + v * 30)} W`],
      ['infoBestHr5s',    'run',  v => `${Math.round(192 + v * 6)} bpm`],
      ['infoBestRun400',  'run',  v => `${(78 - v * 5).toFixed(1)} s`],
      ['infoBestSwim100', 'swim', v => `${(92 - v * 6).toFixed(1)} s`],
    ];
    const bestWeeks = [0, 1, 1, 3, 5, 8, 12];
    bestWeeks.forEach((w, i) => {
      const [metricKey, sport, fmt] = BEST_KINDS[i % BEST_KINDS.length];
      const d = new Date(ref); d.setDate(d.getDate() - (w * 7 + Math.floor(rnd() * 6)));
      D.bests.push({ date: d.toISOString().slice(0, 10), week: w, metricKey, sport, value: fmt(rnd()) });
    });
    D.bests.sort((a, b) => b.date.localeCompare(a.date));
  }

  // The generation loop runs w = oldest → current, so weekly/checkins are
  // already oldest → newest. (week numbers count DOWN toward now: 25 = oldest.)
  return D;
}

// ── 'mine' — real data from the entity store and streams ─────────────────────
// The same dataset shape, built from bh_sessions + bh_stream_* instead of the
// seeded PRNG. TSS-family values (tss, fitness, fatigue, form) stay null until
// the calc module exists — panels gated on them simply don't render.

const SPORT_FROM_RAW = {
  running: 'run', trail_running: 'run', treadmill_running: 'run',
  cycling: 'bike', biking: 'bike', virtual_ride: 'bike',
  swimming: 'swim', open_water: 'swim', lap_swimming: 'swim',
};

// Rolling-mean peak windows in 10 s bins. The '5s' column is approximated by a
// single 10 s bin — the stream resolution floor; honest enough for the POC.
const PEAK_WINDOWS = [['5s', 1], ['1m', 6], ['5m', 30], ['20m', 120], ['60m', 360]];

export function hasMineData() {
  return allSessions().some(s => s.source === 'garmin');
}

function parseDurMin(duration) {
  const n = parseInt(duration, 10);
  return Number.isFinite(n) ? n : null;
}

function bestRollingMean(values, win) {
  const vals = values.map(v => (typeof v === 'number' ? v : 0));
  if (vals.length < win) return null;
  let sum = 0, best = -Infinity;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= win) sum -= vals[i - win];
    if (i >= win - 1) best = Math.max(best, sum / win);
  }
  return Math.round(best);
}

function buildMineDataset(ref) {
  const D = emptyDataset();
  D.kind = 'mine';

  const todayKey = getDateKey(ref);
  const refWeekStart = new Date(weekStartOf(todayKey) + 'T00:00:00').getTime();
  const weekIndex = dateKey =>
    Math.max(0, Math.round((refWeekStart - new Date(weekStartOf(dateKey) + 'T00:00:00').getTime()) / (7 * 86400000)));

  const entities = allSessions().filter(s =>
    s.dateKey <= todayKey &&
    (s.status === 'completed' || s.status === 'skipped') &&
    s.isTraining !== false
  );
  if (entities.length === 0) return D;

  const streamsById = {};
  for (const e of entities) {
    if (e.source === 'garmin') {
      const st = getStreams(e.id);
      if (st?.t?.length) streamsById[e.id] = st;
    }
  }

  // Observed max HR across everything — the zone-band anchor. POC stand-in:
  // real zones come from field tests via the future calc module.
  let maxHr = 0;
  for (const st of Object.values(streamsById)) {
    for (const v of st.hr || []) if (typeof v === 'number' && v > maxHr) maxHr = v;
  }
  for (const e of entities) if (e.summary?.maxHr > maxHr) maxHr = e.summary.maxHr;

  for (const e of entities.slice().sort((a, b) => a.dateKey.localeCompare(b.dateKey))) {
    const durMin = parseDurMin(e.duration);
    const power  = e.summary?.avgPowerW ?? null;
    D.sessions.push({
      id: e.id, date: e.dateKey, week: weekIndex(e.dateKey),
      title: e.title || null,
      sport: SPORT_FROM_RAW[(e.sport || '').toLowerCase()] || null,
      type: e.type, durMin,
      km: e.summary?.distanceM != null ? +(e.summary.distanceM / 1000).toFixed(1) : null,
      tss: null,
      power,
      hr: e.summary?.avgHr ?? null,
      kj: power != null && durMin != null ? Math.round((power * durMin * 60) / 1000) : null,
      // Smiley feedback is 1–5; the panel axis is RPE-style 1–10 (POC mapping ×2).
      body: e.feedback?.body ? e.feedback.body * 2 : null,
      mind: e.feedback?.mind ? e.feedback.mind * 2 : null,
      comment: e.feedback?.comment || '',
      status: e.status === 'skipped' ? 'skipped' : 'done',
    });
  }

  const maxWeek = Math.max(...D.sessions.map(s => s.week));
  for (let w = maxWeek; w >= 0; w--) {
    const inWeek = D.sessions.filter(s => s.week === w);
    const done   = inWeek.filter(s => s.status === 'done');
    const kj     = done.reduce((a, s) => a + (s.kj || 0), 0);

    // Zone distribution from HR streams of this week's imported sessions.
    let zones = null;
    if (maxHr > 0) {
      const bands = [0, 0, 0, 0, 0];
      let n = 0;
      for (const s of inWeek) {
        const hr = streamsById[s.id]?.hr;
        if (!hr) continue;
        for (const v of hr) {
          if (typeof v !== 'number') continue;
          const pct = v / maxHr;
          bands[pct < 0.6 ? 0 : pct < 0.7 ? 1 : pct < 0.8 ? 2 : pct < 0.9 ? 3 : 4]++;
          n++;
        }
      }
      if (n > 0) zones = bands.map(b => Math.round((b / n) * 100));
    }

    D.weekly.push({
      week: w,
      tss: null,
      min: done.reduce((a, s) => a + (s.durMin || 0), 0),
      kj: kj > 0 ? kj : null,
      done: done.length,
      skipped: inWeek.filter(s => s.status === 'skipped').length,
      fitness: null, fatigue: null, form: null,
      zones,
      longest: Math.max(0, ...done.map(s => s.durMin || 0)),
    });
  }

  // Peaks: best rolling means per month, oldest → newest. Bests: the dated
  // moment each all-time peak was set, newest first.
  const monthly = { power: new Map(), hr: new Map() };
  const alltime = {};
  const sessionsByDate = D.sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sessionsByDate) {
    const st = streamsById[s.id];
    if (!st) continue;
    const month = new Date(s.date + 'T00:00:00').toLocaleString('en', { month: 'short' });
    for (const [chan, key] of [['powerW', 'power'], ['hr', 'hr']]) {
      if (!st[chan]) continue;
      if (!monthly[key].has(month)) monthly[key].set(month, {});
      const row = monthly[key].get(month);
      for (const [label, win] of PEAK_WINDOWS) {
        const best = bestRollingMean(st[chan], win);
        if (best == null) continue;
        if (row[label] == null || best > row[label]) row[label] = best;
        const atKey = `${key}-${label}`;
        if (!alltime[atKey] || best > alltime[atKey].value) {
          alltime[atKey] = { value: best, date: s.date, week: s.week, sport: s.sport };
        }
      }
    }
  }
  D.peaksPower = [...monthly.power.entries()].map(([label, row]) => ({ label, ...row }));
  D.peaksHr    = [...monthly.hr.entries()].map(([label, row]) => ({ label, ...row }));

  const BEST_METRIC_KEYS = { 'power-5s': 'infoBestPower5s', 'power-1m': 'infoBestPower1m', 'hr-5s': 'infoBestHr5s' };
  for (const [atKey, metricKey] of Object.entries(BEST_METRIC_KEYS)) {
    const b = alltime[atKey];
    if (!b) continue;
    const unit = atKey.startsWith('power') ? 'W' : 'bpm';
    D.bests.push({ date: b.date, week: b.week, metricKey, sport: b.sport || 'run', value: `${b.value} ${unit}` });
  }
  D.bests.sort((a, b) => b.date.localeCompare(a.date));

  return D;
}

// ── Time-range windowing ──────────────────────────────────────────────────────
// Clips a dataset to the last `weeks` weeks. The single place windowing
// happens — panels and the Comparison Graph render whatever they're given.
// Week numbers count down toward now (0 = current), so "last N weeks" keeps
// entries with week < N. Sleep is daily (day counts down too); peaks are
// monthly bests, clipped to ~one row per 4 weeks of window. Race facts
// (weeksToRace, raceName) are about the future and never clipped.
export function windowDataset(dataset, weeks) {
  if (weeks == null) return dataset; // 'all history'
  const months = Math.max(1, Math.ceil(weeks / 4));
  return {
    ...dataset,
    sessions: dataset.sessions.filter(s => s.week < weeks),
    weekly:   dataset.weekly.filter(w => w.week < weeks),
    checkins: dataset.checkins.filter(c => c.week < weeks),
    sleep:    dataset.sleep.filter(d => d.day < weeks * 7),
    peaksPower: dataset.peaksPower.slice(-months),
    peaksHr:    dataset.peaksHr.slice(-months),
    bests:      dataset.bests.filter(b => b.week < weeks),
  };
}
