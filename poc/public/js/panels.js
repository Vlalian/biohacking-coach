// Panel Catalog — pure module, no DOM, no storage, no translations import.
//
// Each Panel declares: id, familyKey, titleKey, an optional compare capability,
// a one-reading predicate has(dataset), and render(dataset, opts) → HTML
// string. Labels resolve through the injected opts.t so the module stays pure
// (the orchestrator passes the real translator; tests pass identity).
//
// Rules (ADR-0004): panels show data, never Coach-derived interpretation — no
// Pattern Insights here, ever. A panel whose predicate is false must not be
// rendered at all: no dead empty-state placeholders. A panel renders as soon
// as ONE reading exists (Progressive Disclosure, one-reading rule).
//
// Catalog array order = feed order: Form & Load, Body & Mind, Volume,
// Peaks & Zones. Technical sports terms (TSS, RPE, W, bpm, kJ, Z1–Z5,
// Fatigue/Fitness/Form) stay in English in every Athlete Language.
//
// Panels with a `series(dataset)` method expose their time series for the
// Comparison Graph: [{ labelKey, color, values }]. The orchestrator collects
// series from user-picked panels into one combined normalized chart.

// ── SVG helpers ───────────────────────────────────────────────────────────────
// Charts scale with their container: aspect-ratio keeps the viewBox
// proportions, so a panel spanning a wider grid cell renders taller too
// (this is what makes the enlarge feature work without per-panel sizes).
export function svgOpen(w, h) {
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:auto;aspect-ratio:${w}/${h};display:block;">`;
}

function pathFor(vals, w, h, pad = 4) {
  if (!vals.length) return '';
  const mx = Math.max(...vals, 1), mn = Math.min(...vals, 0);
  const sx = i => vals.length === 1 ? w / 2 : pad + (i / (vals.length - 1)) * (w - 2 * pad);
  const sy = v => h - pad - ((v - mn) / (mx - mn || 1)) * (h - 2 * pad);
  return vals.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
}

// One reading renders as a dot, not a degenerate path.
export function line(vals, w, h, color, dashed = false) {
  if (!vals.length) return '';
  if (vals.length === 1) return `<circle cx="${w / 2}" cy="${h / 2}" r="3.5" fill="${color}"/>`;
  return `<path d="${pathFor(vals, w, h)}" fill="none" stroke="${color}" stroke-width="2" ${dashed ? 'stroke-dasharray="5,4" opacity="0.55"' : ''}/>`;
}

export function bars(vals, w, h, color, pad = 2) {
  if (!vals.length) return '';
  const mx = Math.max(...vals, 1);
  const bw = w / vals.length;
  return vals.map((v, i) =>
    `<rect x="${(i * bw + pad).toFixed(1)}" y="${(h - (v / mx) * (h - 4)).toFixed(1)}" width="${Math.max(1, bw - 2 * pad).toFixed(1)}" height="${((v / mx) * (h - 4)).toFixed(1)}" rx="1.5" fill="${color}"/>`
  ).join('');
}

function donutSvg(parts, size = 110) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  const r = size / 2 - 8, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  let off = 0;
  const rings = parts.map(p => {
    const frac = p.v / total;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.c}" stroke-width="14"
      stroke-dasharray="${(frac * C).toFixed(1)} ${(C - frac * C).toFixed(1)}" stroke-dashoffset="${(-off * C).toFixed(1)}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    off += frac;
    return seg;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;flex:none;">${rings}</svg>`;
}

export function legend(items) {
  return `<div class="iv-legend">${items.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>`;
}

// ── Shared dataset selectors ──────────────────────────────────────────────────
// Weekly averages of a Session Reflection dimension ('body' | 'mind'),
// oldest → newest.
export function weeklyAvg(dataset, key) {
  const byWeek = new Map();
  dataset.sessions.filter(s => s[key] != null).forEach(s => {
    if (!byWeek.has(s.week)) byWeek.set(s.week, []);
    byWeek.get(s.week).push(s[key]);
  });
  return [...byWeek.entries()].sort((a, b) => b[0] - a[0])
    .map(([, arr]) => +(arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(1));
}

function sportSplit(D, key, fmt, t) {
  const tot = {};
  D.sessions.filter(s => s.status === 'done').forEach(s => { tot[s.sport] = (tot[s.sport] || 0) + s[key]; });
  const parts = Object.entries(tot).map(([sp, v]) => ({ v, c: SPORT_COLOR[sp], n: t(SPORT_KEY[sp] || sp) }));
  const sum = parts.reduce((a, p) => a + p.v, 0) || 1;
  return `<div class="iv-donutrow">${donutSvg(parts)}
    <div class="iv-donutleg">${parts.map(p =>
      `<div><i style="background:${p.c}"></i>${p.n} <b>${Math.round((p.v / sum) * 100)}%</b> <span>${fmt(p.v)}</span></div>`).join('')}</div></div>`;
}

function peaksTable(rows) {
  const cols = ['5s', '1m', '5m', '20m', '60m'];
  return `<table class="iv-table"><tr><th></th>${cols.map(c => `<th>${c}</th>`).join('')}</tr>
    ${rows.map((r, i) => `<tr${i === rows.length - 1 ? ' class="iv-hl"' : ''}><td>${r.label}</td>${cols.map(c => `<td>${r[c]}</td>`).join('')}</tr>`).join('')}</table>`;
}

const FF_COLORS   = { fatigue: '#e05555', fitness: '#4a90d9', form: '#c9a96e' };
const BODY_COLOR  = '#6db36d';
const MIND_COLOR  = '#9a7bd0';
const SPORT_COLOR = { swim: '#4fa3d9', bike: '#c9a96e', run: '#6db36d', strength: '#9a7bd0' };
const SPORT_KEY   = { swim: 'infoSwim', bike: 'infoBike', run: 'infoRun' };
const ZONE_COLORS = ['#6db36d', '#4a90d9', '#c9a96e', '#e08b55', '#e05555'];

// Ramp rates: fitness change over trailing windows (in weeks of the weekly
// series). A window renders only when the series fully covers it; when no
// window fits (single reading), one tile shows the shortest window with no
// delta — present, honest, empty of judgment. Exported for table tests.
export function rampRates(values) {
  const WINDOWS = [[1, '7d'], [4, '28d'], [13, '90d'], [52, '365d']];
  const len = values.length;
  const tiles = WINDOWS
    .filter(([w]) => len - 1 >= w)
    .map(([w, label]) => ({
      label,
      delta: +(values[len - 1] - values[len - 1 - w]).toFixed(0),
      spark: values.slice(len - 1 - w),
    }));
  if (!tiles.length && len) return [{ label: '7d', delta: null, spark: [...values] }];
  return tiles;
}

const FAMILY = {
  formLoad: 'infoFamilyFormLoad',
  bodyMind: 'infoFamilyBodyMind',
  volume:   'infoFamilyVolume',
  peaks:    'infoFamilyPeaks',
};

// ── The catalog ───────────────────────────────────────────────────────────────
export const PANELS = [
  // ── Form & Load ──
  {
    id: 'ffnow', familyKey: FAMILY.formLoad, titleKey: 'infoPanelFormToday',
    // Fitness/fatigue are TSS-derived: null on real data until the calc module.
    has: D => D.weekly.some(w => w.fitness != null),
    render: (D) => {
      const l = D.weekly[D.weekly.length - 1];
      return `<div class="iv-ffrow">
        ${[['Fatigue', l.fatigue, FF_COLORS.fatigue], ['Fitness', l.fitness, FF_COLORS.fitness], ['Form', l.form, FF_COLORS.form]]
          .map(([n, v, c]) => `<div class="iv-ffbox" style="border-color:${c}"><div class="iv-ffval" style="color:${c}">${v}</div><div class="iv-fflab">${n}</div></div>`).join('')}
      </div>`;
    },
  },
  {
    id: 'race', familyKey: FAMILY.formLoad, titleKey: 'infoPanelRace',
    has: D => D.weeksToRace != null,
    render: (D, { t = k => k } = {}) => `<div class="iv-race"><div class="iv-ffval" style="color:var(--accent)">${D.weeksToRace}</div>
      <div class="iv-fflab">${t('infoWeeksUntil')}<br>${D.raceName}</div></div>`,
  },
  {
    id: 'load', familyKey: FAMILY.formLoad, titleKey: 'infoPanelLoad',
    has: D => D.weekly.some(w => w.fitness != null),
    series: D => [
      { labelKey: 'Fitness', color: FF_COLORS.fitness, values: D.weekly.map(w => w.fitness) },
      { labelKey: 'Fatigue', color: FF_COLORS.fatigue, values: D.weekly.map(w => w.fatigue) },
      { labelKey: 'Form',    color: FF_COLORS.form,    values: D.weekly.map(w => w.form) },
    ],
    render: (D, { t = k => k } = {}) => {
      let s = svgOpen(300, 110);
      s += bars(D.weekly.map(w => w.tss), 300, 110, 'rgba(107,107,107,0.25)');
      for (const k of ['fitness', 'fatigue', 'form']) s += line(D.weekly.map(w => w[k]), 300, 110, FF_COLORS[k]);
      s += '</svg>';
      return s + legend([['Fitness', FF_COLORS.fitness], ['Fatigue', FF_COLORS.fatigue], ['Form', FF_COLORS.form], [t('infoWeeklyTss'), 'rgba(107,107,107,0.5)']]);
    },
  },
  {
    // "Building or fading?" — arithmetic only: the sign and color are math,
    // never judgment or advice.
    id: 'ramp', familyKey: FAMILY.formLoad, titleKey: 'infoPanelRamp',
    has: D => D.weekly.some(w => w.fitness != null),
    render: (D) => {
      const tiles = rampRates(D.weekly.map(w => w.fitness));
      return `<div class="iv-ramprow">${tiles.map(tl => {
        const color = tl.delta == null ? 'var(--muted)' : tl.delta > 0 ? '#6db36d' : tl.delta < 0 ? '#e05555' : 'var(--muted)';
        const text  = tl.delta == null ? '—' : `${tl.delta > 0 ? '+' : ''}${tl.delta}`;
        return `<div class="iv-ramptile">
          <div class="iv-ffval" style="color:${color};font-size:20px;">${text}</div>
          <div class="iv-fflab">${tl.label}</div>
          ${tl.spark.length > 1 ? svgOpen(90, 22) + line(tl.spark, 90, 22, color) + '</svg>' : ''}
        </div>`;
      }).join('')}</div>`;
    },
  },
  {
    id: 'consistency', familyKey: FAMILY.formLoad, titleKey: 'infoPanelConsistency',
    has: D => D.weekly.length > 0,
    series: D => [
      { labelKey: 'statusCompleted', color: BODY_COLOR, values: D.weekly.map(w => w.done) },
    ],
    render: (D, { t = k => k } = {}) => {
      let s = svgOpen(300, 90);
      const mx = Math.max(...D.weekly.map(w => w.done + w.skipped), 1);
      const bw = 300 / D.weekly.length;
      D.weekly.forEach((w, i) => {
        const hDone = (w.done / mx) * 80, hSkip = (w.skipped / mx) * 80;
        s += `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${(86 - hDone).toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${hDone.toFixed(1)}" rx="1.5" fill="${BODY_COLOR}"/>`;
        if (w.skipped) s += `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${(86 - hDone - hSkip - 1.5).toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${hSkip.toFixed(1)}" rx="1.5" fill="rgba(224,85,85,0.55)"/>`;
      });
      s += '</svg>';
      const totDone = D.weekly.reduce((a, w) => a + w.done, 0), totAll = D.weekly.reduce((a, w) => a + w.done + w.skipped, 0);
      return s + legend([[t('statusCompleted'), BODY_COLOR], [t('statusSkipped'), 'rgba(224,85,85,0.7)']]) +
        `<div class="iv-note">${t('infoConsistencyNote').replace('{done}', totDone).replace('{all}', totAll)}</div>`;
    },
  },

  // ── Body & Mind ──
  {
    id: 'bodymind', familyKey: FAMILY.bodyMind, titleKey: 'infoPanelBodyMind',
    has: D => D.sessions.some(s => s.body != null || s.mind != null),
    series: D => [
      { labelKey: 'feedbackBodyShort', color: BODY_COLOR, values: weeklyAvg(D, 'body') },
      { labelKey: 'feedbackMindShort', color: MIND_COLOR, values: weeklyAvg(D, 'mind') },
    ],
    render: (D, { t = k => k } = {}) => {
      const body = weeklyAvg(D, 'body'), mind = weeklyAvg(D, 'mind');
      let s = svgOpen(300, 100);
      s += line(body, 300, 100, BODY_COLOR) + line(mind, 300, 100, MIND_COLOR);
      s += '</svg>';
      return s
        + legend([[t('feedbackBodyShort'), BODY_COLOR], [t('feedbackMindShort'), MIND_COLOR]])
        + `<div class="iv-note">${t('infoWeeklyAvgNote')}</div>`;
    },
  },
  {
    id: 'checkin', familyKey: FAMILY.bodyMind, titleKey: 'infoPanelCheckin',
    has: D => D.checkins.length > 0,
    series: D => [
      { labelKey: 'infoEnergy',       color: '#4fa3d9',  values: D.checkins.map(x => x.energy) },
      { labelKey: 'infoSleepQuality', color: MIND_COLOR, values: D.checkins.map(x => x.sleepq) },
      { labelKey: 'infoMood',         color: BODY_COLOR, values: D.checkins.map(x => x.mood) },
      { labelKey: 'infoMotivation',   color: '#c9a96e',  values: D.checkins.map(x => x.motivation) },
    ],
    render: (D, { t = k => k } = {}) => `<div class="iv-minigrid">${[['energy', 'infoEnergy', '#4fa3d9'], ['sleepq', 'infoSleepQuality', MIND_COLOR], ['mood', 'infoMood', BODY_COLOR], ['motivation', 'infoMotivation', '#c9a96e']]
      .map(([k, labKey, c]) => {
        const vals = D.checkins.map(x => x[k]);
        return `<div class="iv-mini"><div class="iv-minihead"><span>${t(labKey)}</span><b style="color:${c}">${vals[vals.length - 1]}</b></div>
          ${svgOpen(140, 34)}${line(vals, 140, 34, c)}</svg></div>`;
      }).join('')}</div>`,
  },
  {
    id: 'sleep', familyKey: FAMILY.bodyMind, titleKey: 'infoPanelSleep',
    has: D => D.sleep.length > 0,
    series: D => [
      { labelKey: 'infoSleepHours', color: MIND_COLOR, values: D.sleep.map(x => x.hours) },
      { labelKey: 'infoFeeling',    color: '#c9a96e',  values: D.sleep.map(x => x.feeling) },
    ],
    render: (D, { t = k => k } = {}) => {
      let s = svgOpen(300, 100);
      s += bars(D.sleep.map(x => x.hours), 300, 100, 'rgba(154,123,208,0.45)');
      s += line(D.sleep.map(x => x.feeling * 2), 300, 100, '#c9a96e');
      s += '</svg>';
      return s + legend([[t('infoSleepHours'), MIND_COLOR], [t('infoFeeling'), '#c9a96e']]);
    },
  },

  // ── Volume ──
  {
    id: 'split-dur', familyKey: FAMILY.volume, titleKey: 'infoPanelSplitDur',
    has: D => D.sessions.some(s => s.status === 'done'),
    render: (D, { t = k => k } = {}) => sportSplit(D, 'durMin', v => Math.round(v / 60) + 'h', t),
  },
  {
    id: 'split-dist', familyKey: FAMILY.volume, titleKey: 'infoPanelSplitDist',
    has: D => D.sessions.some(s => s.status === 'done'),
    render: (D, { t = k => k } = {}) => sportSplit(D, 'km', v => Math.round(v) + ' km', t),
  },
  {
    id: 'hours', familyKey: FAMILY.volume, titleKey: 'infoPanelHours',
    has: D => D.weekly.length > 0,
    series: D => [
      { labelKey: 'infoPanelHours', color: '#4a90d9', values: D.weekly.map(w => +(w.min / 60).toFixed(1)) },
    ],
    render: (D, { t = k => k } = {}) => {
      const vals = D.weekly.map(w => +(w.min / 60).toFixed(1));
      let s = svgOpen(300, 90) + bars(vals, 300, 90, 'rgba(74,144,217,0.75)') + '</svg>';
      const avg = (vals.reduce((a, v) => a + v, 0) / (vals.length || 1)).toFixed(1);
      return s + `<div class="iv-note">${t('infoAvgPerWeek').replace('{avg}', avg)}</div>`;
    },
  },
  {
    id: 'longest', familyKey: FAMILY.volume, titleKey: 'infoPanelLongest',
    has: D => D.weekly.some(w => w.longest > 0),
    series: D => [
      { labelKey: 'infoPanelLongest', color: '#4fa3d9', values: D.weekly.map(w => w.longest) },
    ],
    render: (D, { t = k => k } = {}) => {
      const s = svgOpen(300, 90) + bars(D.weekly.map(w => w.longest), 300, 90, 'rgba(79,163,217,0.75)') + '</svg>';
      return s + `<div class="iv-note">${t('infoLongestNote')}</div>`;
    },
  },
  {
    id: 'work', familyKey: FAMILY.volume, titleKey: 'infoPanelWork',
    has: D => D.weekly.some(w => w.kj > 0),
    series: D => [
      { labelKey: 'infoPanelWork', color: '#6b6b6b', values: D.weekly.map(w => w.kj) },
    ],
    render: D => svgOpen(300, 90) + bars(D.weekly.map(w => w.kj), 300, 90, 'rgba(107,107,107,0.6)') + '</svg>',
  },

  // ── Peaks & Zones (wearable-dependent) ──
  {
    id: 'zones', familyKey: FAMILY.peaks, titleKey: 'infoPanelZones',
    has: D => D.weekly.some(w => w.zones),
    render: D => {
      const rows = D.weekly.filter(w => w.zones);
      let s = svgOpen(300, 90);
      const bw = 300 / rows.length;
      rows.forEach((w, i) => {
        let y = 86;
        w.zones.forEach((pct, z) => {
          const h = (pct / 100) * 80; y -= h;
          s += `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${h.toFixed(1)}" fill="${ZONE_COLORS[z]}"/>`;
        });
      });
      s += '</svg>';
      return s + legend(ZONE_COLORS.map((c, z) => [`Z${z + 1}`, c]));
    },
  },
  {
    // A feed of the moments, not a table of the numbers. Data only:
    // celebrating a PB is the Coach's job in conversation, not the panel's.
    id: 'bests', familyKey: FAMILY.peaks, titleKey: 'infoPanelBests',
    has: D => D.bests.length > 0,
    render: (D, { t = k => k } = {}) => D.bests.slice(0, 6).map(b =>
      `<div class="iv-bestrow">
        <span class="iv-bestdate">${b.date}</span>
        <i class="iv-bestdot" style="background:${SPORT_COLOR[b.sport] || 'var(--muted)'}"></i>
        <span class="iv-bestlabel">${t(b.metricKey)}</span>
        <b>${b.value}</b>
      </div>`).join(''),
  },
  {
    id: 'peaks-power', familyKey: FAMILY.peaks, titleKey: 'infoPanelPeakPower',
    has: D => D.peaksPower.length > 0,
    render: D => peaksTable(D.peaksPower),
  },
  {
    id: 'peaks-hr', familyKey: FAMILY.peaks, titleKey: 'infoPanelPeakHr',
    has: D => D.peaksHr.length > 0,
    render: D => peaksTable(D.peaksHr),
  },
];

export function availablePanels(dataset) {
  return PANELS.filter(p => p.has(dataset));
}

export function panelById(id) {
  return PANELS.find(p => p.id === id);
}
