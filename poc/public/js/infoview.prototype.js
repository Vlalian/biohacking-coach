// ═══════════════════════════════════════════════════════════════════════════
// PROTOTYPE — Information View, running on SYNTHETIC data (seeded PRNG).
//
// Verdict 2026-07-14 (Mads): Variant B — "Index Rail" — won the three-variant
// prototype (A Two-Zone Wall / B Index Rail / C Glance Strip). This file is
// the winner folded in; the losing variants and the ?variant= switcher are
// deleted. Layout: grouped rail index (★ Favorites first, then panel
// families) + single-column feed of large panels. Star = promote/demote.
//
// Still a prototype: all data synthetic, no persistence (favorites reset on
// reload), English only. The real build follows the Information View PRD
// (see .scratch/nav-training-plan/issues/09-bodily-information-page.md and
// ADR-0004) — rewrite properly there; don't promote this code as-is.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Synthetic data ────────────────────────────────────────────────────────────
const SPORTS = ['swim', 'bike', 'run'];
const SPORT_COLOR = { swim: '#4fa3d9', bike: '#c9a96e', run: '#6db36d', strength: '#9a7bd0' };
const TYPE_COLOR  = { Endurance: '#4a90d9', Intensity: '#e05555', Tempo: '#c9a96e', Recovery: '#6db36d' };

function genData(kind) {
  const rnd = mulberry32(kind === 'rich' ? 42 : 7);
  const weeks = kind === 'rich' ? 26 : 1;
  const today = new Date();
  const sessions = [], checkins = [], sleep = [], peaksPower = [], peaksHr = [];
  let fitness = kind === 'rich' ? 30 : 0, fatigue = kind === 'rich' ? 30 : 0;
  const weekly = [];

  const TITLES = {
    swim: ['Cottonwill Set', 'CSS Intervals', 'Open Water Prep', 'Drill & Pull'],
    bike: ['ME & AE Ride', 'VO2 Max Bike', 'Over-Unders', 'Long Zone 2', 'Speed Skills'],
    run:  ['Endurance Run', 'Mona Fartlek', 'Brick Run', 'Easy Run + Pick-ups', 'Tempo Run'],
  };

  for (let w = weeks - 1; w >= 0; w--) {
    const phaseRamp = 1 + 0.35 * (1 - w / weeks);
    const recovery  = kind === 'rich' && (weeks - w) % 4 === 0;
    const planned   = kind === 'rich' ? 5 + Math.floor(rnd() * 2) : 3;
    let weekTss = 0, weekMin = 0, weekKj = 0, done = 0, skipped = 0;

    for (let s = 0; s < planned; s++) {
      const dayOffset = w * 7 + (6 - Math.floor(rnd() * 7));
      const d = new Date(today); d.setDate(d.getDate() - dayOffset);
      if (d > today) continue;
      const sport = SPORTS[Math.floor(rnd() * 3)];
      const type  = recovery ? 'Recovery'
        : ['Endurance', 'Endurance', 'Intensity', 'Tempo', 'Recovery'][Math.floor(rnd() * 5)];
      const durMin = Math.round((type === 'Endurance' ? 70 + rnd() * 80 : 40 + rnd() * 45) * (recovery ? 0.6 : phaseRamp));
      const isSkipped = kind === 'rich' && rnd() < 0.12;
      const tss = Math.round(durMin * (type === 'Intensity' ? 1.05 : type === 'Tempo' ? 0.85 : type === 'Recovery' ? 0.45 : 0.65));
      const km  = sport === 'swim' ? +(durMin / 30).toFixed(1) : sport === 'bike' ? Math.round(durMin * 0.48) : +(durMin / 5.6).toFixed(1);
      const sess = {
        id: `s${w}-${s}`, date: d.toISOString().slice(0, 10), week: w,
        title: TITLES[sport][Math.floor(rnd() * TITLES[sport].length)],
        sport, type, durMin, km, tss,
        power: sport === 'bike' && kind === 'rich' ? Math.round(150 + 60 * (1 - w / weeks) + rnd() * 25) : null,
        hr:    kind === 'rich' ? Math.round(128 + (type === 'Intensity' ? 25 : 8) + rnd() * 12) : null,
        kj:    sport === 'bike' ? Math.round(durMin * 9) : null,
        body: null, mind: null, comment: '',
        status: isSkipped ? 'skipped' : 'done',
      };
      if (!isSkipped) {
        sess.body = Math.max(1, Math.min(10, Math.round(7 - (phaseRamp - 1) * 5 + rnd() * 3 - (recovery ? -1 : 0))));
        sess.mind = Math.max(1, Math.min(10, Math.round(7.5 - (type === 'Intensity' ? 1.5 : 0) + rnd() * 2.5)));
        if (rnd() < 0.2) sess.comment = ['Felt strong.', 'Legs heavy from yesterday.', '60g carbs/h, worked well.', 'Cut short — time.'][Math.floor(rnd() * 4)];
        done++; weekTss += sess.tss; weekMin += durMin; weekKj += sess.kj || 0;
      } else skipped++;
      sessions.push(sess);
    }

    fitness = fitness + (weekTss / 7 - fitness) * 0.13;
    fatigue = fatigue + (weekTss / 7 - fatigue) * 0.38;
    weekly.push({
      week: w, tss: weekTss, min: weekMin, kj: weekKj, done, skipped,
      fitness: Math.round(fitness), fatigue: Math.round(fatigue),
      form: Math.round(fitness - fatigue),
      zones: recovery ? [55, 30, 10, 4, 1] : [38, 27, 17, 12, 6],
      longest: Math.max(0, ...sessions.filter(x => x.week === w && x.status === 'done').map(x => x.durMin)),
    });

    checkins.push({
      week: w,
      energy:     Math.max(1, Math.min(10, Math.round(7 - (phaseRamp - 1) * 6 + rnd() * 3))),
      sleepq:     Math.max(1, Math.min(10, Math.round(6.5 + rnd() * 3 - (phaseRamp - 1) * 3))),
      mood:       Math.max(1, Math.min(10, Math.round(7 + rnd() * 2.5 - (phaseRamp - 1) * 2))),
      motivation: Math.max(1, Math.min(10, Math.round(8 - (weeks - w) * 0.05 + rnd() * 2))),
    });
  }

  const sleepDays = kind === 'rich' ? 30 : 4;
  for (let i = sleepDays - 1; i >= 0; i--) {
    sleep.push({ day: i, hours: +(5.8 + rnd() * 2.6).toFixed(1), feeling: Math.ceil(rnd() * 5) });
  }

  if (kind === 'rich') {
    const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    months.forEach((m, i) => {
      const g = i / months.length;
      peaksPower.push({ label: m, '5s': Math.round(680 + g * 190 + rnd() * 30), '1m': Math.round(340 + g * 80 + rnd() * 20), '5m': Math.round(255 + g * 50 + rnd() * 15), '20m': Math.round(215 + g * 40 + rnd() * 10), '60m': Math.round(190 + g * 35 + rnd() * 10) });
      peaksHr.push({ label: m, '5s': Math.round(186 + rnd() * 8), '1m': Math.round(180 + rnd() * 6), '5m': Math.round(174 + rnd() * 5), '20m': Math.round(168 + rnd() * 5), '60m': Math.round(160 + rnd() * 5) });
    });
  }

  weekly.reverse(); checkins.reverse();
  return {
    kind, sessions, weekly, checkins, sleep, peaksPower, peaksHr,
    weeksToRace: kind === 'rich' ? 8 : 24,
    raceName: 'Assundman 70.3',
  };
}

const DATA = { rich: genData('rich'), fresh: genData('fresh') };

// ── SVG helpers ───────────────────────────────────────────────────────────────
function svgEl(w, h) { return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block;">`; }
function pathFor(vals, w, h, pad = 4) {
  if (!vals.length) return '';
  const mx = Math.max(...vals, 1), mn = Math.min(...vals, 0);
  const sx = i => vals.length === 1 ? w / 2 : pad + (i / (vals.length - 1)) * (w - 2 * pad);
  const sy = v => h - pad - ((v - mn) / (mx - mn || 1)) * (h - 2 * pad);
  return vals.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
}
function line(vals, w, h, color, dashed = false) {
  if (vals.length === 1) {
    return `<circle cx="${w / 2}" cy="${h / 2}" r="3.5" fill="${color}"/>`;
  }
  return `<path d="${pathFor(vals, w, h)}" fill="none" stroke="${color}" stroke-width="2" ${dashed ? 'stroke-dasharray="5,4" opacity="0.55"' : ''}/>`;
}
function bars(vals, w, h, color, pad = 2) {
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

// ── Panel catalog ─────────────────────────────────────────────────────────────
const FF_COLORS = { fatigue: '#e05555', fitness: '#4a90d9', form: '#c9a96e' };

const PANELS = [
  {
    id: 'ffnow', family: 'Form & Load', title: 'Form Today',
    has: D => D.weekly.length > 0,
    render: D => {
      const l = D.weekly[D.weekly.length - 1];
      return `<div class="iv-ffrow">
        ${[['Fatigue', l.fatigue, FF_COLORS.fatigue], ['Fitness', l.fitness, FF_COLORS.fitness], ['Form', l.form, FF_COLORS.form]]
          .map(([n, v, c]) => `<div class="iv-ffbox" style="border-color:${c}"><div class="iv-ffval" style="color:${c}">${v}</div><div class="iv-fflab">${n}</div></div>`).join('')}
      </div>`;
    },
  },
  {
    id: 'race', family: 'Form & Load', title: 'Race Countdown',
    has: D => D.weeksToRace != null,
    render: D => `<div class="iv-race"><div class="iv-ffval" style="color:var(--accent)">${D.weeksToRace}</div>
      <div class="iv-fflab">weeks until<br>${D.raceName}</div></div>`,
  },
  {
    id: 'load', family: 'Form & Load', title: 'Load History', compare: true,
    has: D => D.weekly.length > 0,
    render: (D, o) => {
      const half = Math.floor(D.weekly.length / 2);
      const cur  = o.compare ? D.weekly.slice(half) : D.weekly;
      const prev = o.compare ? D.weekly.slice(0, half) : null;
      let s = svgEl(300, 110);
      s += bars(cur.map(w => w.tss), 300, 110, 'rgba(107,107,107,0.25)');
      for (const k of ['fitness', 'fatigue', 'form']) {
        if (prev) s += line(prev.map(w => w[k]), 300, 110, FF_COLORS[k], true);
        s += line(cur.map(w => w[k]), 300, 110, FF_COLORS[k]);
      }
      s += '</svg>';
      return s + legend([['Fitness', FF_COLORS.fitness], ['Fatigue', FF_COLORS.fatigue], ['Form', FF_COLORS.form], ['weekly TSS', 'rgba(107,107,107,0.5)']])
        + (o.compare ? '<div class="iv-cmpnote">dashed = previous period</div>' : '');
    },
  },
  {
    id: 'bodymind', family: 'Body & Mind', title: 'Body & Mind Feedback', compare: true,
    has: D => D.sessions.some(s => s.body != null),
    render: (D, o) => {
      const body = weeklyAvg(D, 'body'), mind = weeklyAvg(D, 'mind');
      const half = Math.floor(body.length / 2);
      let s = svgEl(300, 100);
      if (o.compare && half > 1) {
        s += line(body.slice(0, half), 300, 100, '#6db36d', true) + line(mind.slice(0, half), 300, 100, '#9a7bd0', true);
        s += line(body.slice(half), 300, 100, '#6db36d') + line(mind.slice(half), 300, 100, '#9a7bd0');
      } else {
        s += line(body, 300, 100, '#6db36d') + line(mind, 300, 100, '#9a7bd0');
      }
      s += '</svg>';
      return s + legend([['Body', '#6db36d'], ['Mind', '#9a7bd0']]) + '<div class="iv-cmpnote">weekly averages, RPE 1–10</div>';
    },
  },
  {
    id: 'checkin', family: 'Body & Mind', title: 'Check-in Signals',
    has: D => D.checkins.length > 0,
    render: D => `<div class="iv-minigrid">${[['energy', 'Energy', '#4fa3d9'], ['sleepq', 'Sleep quality', '#9a7bd0'], ['mood', 'Mood', '#6db36d'], ['motivation', 'Motivation', '#c9a96e']]
      .map(([k, lab, c]) => {
        const vals = D.checkins.map(x => x[k]);
        return `<div class="iv-mini"><div class="iv-minihead"><span>${lab}</span><b style="color:${c}">${vals[vals.length - 1]}</b></div>
          ${svgEl(140, 34)}${line(vals, 140, 34, c)}</svg></div>`;
      }).join('')}</div>`,
  },
  {
    id: 'sleep', family: 'Body & Mind', title: 'Sleep & Feeling', compare: true,
    has: D => D.sleep.length > 0,
    render: (D, o) => {
      const hrs = D.sleep.map(s => s.hours), feel = D.sleep.map(s => s.feeling * 2);
      const half = Math.floor(hrs.length / 2);
      let s = svgEl(300, 100);
      s += bars(o.compare ? hrs.slice(half) : hrs, 300, 100, 'rgba(154,123,208,0.45)');
      if (o.compare && half > 1) s += line(hrs.slice(0, half), 300, 100, '#9a7bd0', true);
      s += line(o.compare ? feel.slice(half) : feel, 300, 100, '#c9a96e');
      s += '</svg>';
      return s + legend([['Sleep hours', '#9a7bd0'], ['Feeling (1–5)', '#c9a96e']]);
    },
  },
  {
    id: 'consistency', family: 'Form & Load', title: 'Consistency',
    has: D => D.weekly.length > 0,
    render: D => {
      let s = svgEl(300, 90);
      const mx = Math.max(...D.weekly.map(w => w.done + w.skipped), 1);
      const bw = 300 / D.weekly.length;
      D.weekly.forEach((w, i) => {
        const hDone = (w.done / mx) * 80, hSkip = (w.skipped / mx) * 80;
        s += `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${(86 - hDone).toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${hDone.toFixed(1)}" rx="1.5" fill="#6db36d"/>`;
        if (w.skipped) s += `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${(86 - hDone - hSkip - 1.5).toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${hSkip.toFixed(1)}" rx="1.5" fill="rgba(224,85,85,0.55)"/>`;
      });
      s += '</svg>';
      const totDone = D.weekly.reduce((a, w) => a + w.done, 0), totAll = D.weekly.reduce((a, w) => a + w.done + w.skipped, 0);
      return s + legend([['completed', '#6db36d'], ['skipped', 'rgba(224,85,85,0.7)']]) +
        `<div class="iv-cmpnote">${totDone} of ${totAll} sessions completed</div>`;
    },
  },
  {
    id: 'split-dur', family: 'Volume', title: 'Sport Split — Duration',
    has: D => D.sessions.some(s => s.status === 'done'),
    render: D => sportSplit(D, 'durMin', v => Math.round(v / 60) + 'h'),
  },
  {
    id: 'split-dist', family: 'Volume', title: 'Sport Split — Distance',
    has: D => D.sessions.some(s => s.status === 'done'),
    render: D => sportSplit(D, 'km', v => Math.round(v) + ' km'),
  },
  {
    id: 'hours', family: 'Volume', title: 'Weekly Hours', compare: true,
    has: D => D.weekly.length > 0,
    render: (D, o) => {
      const vals = D.weekly.map(w => +(w.min / 60).toFixed(1));
      const half = Math.floor(vals.length / 2);
      let s = svgEl(300, 90);
      s += bars(o.compare ? vals.slice(half) : vals, 300, 90, 'rgba(74,144,217,0.75)');
      if (o.compare && half > 1) s += line(vals.slice(0, half), 300, 90, '#e2e2e2', true);
      s += '</svg>';
      const avg = (vals.reduce((a, v) => a + v, 0) / (vals.length || 1)).toFixed(1);
      return s + `<div class="iv-cmpnote">average ${avg} h/week${o.compare ? ' — dashed = previous period' : ''}</div>`;
    },
  },
  {
    id: 'zones', family: 'Peaks & Zones', title: 'Time in Zones',
    has: D => D.kind === 'rich',
    render: D => {
      const ZC = ['#6db36d', '#4a90d9', '#c9a96e', '#e08b55', '#e05555'];
      let s = svgEl(300, 90);
      const bw = 300 / D.weekly.length;
      D.weekly.forEach((w, i) => {
        let y = 86;
        w.zones.forEach((pct, z) => {
          const h = (pct / 100) * 80; y -= h;
          s += `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${h.toFixed(1)}" fill="${ZC[z]}"/>`;
        });
      });
      s += '</svg>';
      return s + legend([['Z1', ZC[0]], ['Z2', ZC[1]], ['Z3', ZC[2]], ['Z4', ZC[3]], ['Z5', ZC[4]]]);
    },
  },
  {
    id: 'peaks-power', family: 'Peaks & Zones', title: 'Peak Power (W)',
    has: D => D.peaksPower.length > 0,
    render: D => peaksTable(D.peaksPower),
  },
  {
    id: 'peaks-hr', family: 'Peaks & Zones', title: 'Peak Heart Rate (bpm)',
    has: D => D.peaksHr.length > 0,
    render: D => peaksTable(D.peaksHr),
  },
  {
    id: 'longest', family: 'Volume', title: 'Longest Workout',
    has: D => D.weekly.some(w => w.longest > 0),
    render: D => {
      let s = svgEl(300, 90) + bars(D.weekly.map(w => w.longest), 300, 90, 'rgba(79,163,217,0.75)') + '</svg>';
      return s + '<div class="iv-cmpnote">longest session per week, minutes</div>';
    },
  },
  {
    id: 'work', family: 'Volume', title: 'Weekly Work (kJ)',
    has: D => D.weekly.some(w => w.kj > 0),
    render: D => svgEl(300, 90) + bars(D.weekly.map(w => w.kj), 300, 90, 'rgba(107,107,107,0.6)') + '</svg>',
  },
];

function weeklyAvg(D, key) {
  const byWeek = new Map();
  D.sessions.filter(s => s[key] != null).forEach(s => {
    if (!byWeek.has(s.week)) byWeek.set(s.week, []);
    byWeek.get(s.week).push(s[key]);
  });
  return [...byWeek.entries()].sort((a, b) => b[0] - a[0])
    .map(([, arr]) => +(arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(1));
}
function legend(items) {
  return `<div class="iv-legend">${items.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>`;
}
function sportSplit(D, key, fmt) {
  const tot = {};
  D.sessions.filter(s => s.status === 'done').forEach(s => { tot[s.sport] = (tot[s.sport] || 0) + s[key]; });
  const parts = Object.entries(tot).map(([sp, v]) => ({ v, c: SPORT_COLOR[sp], n: sp }));
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

// ── State (in-memory only — deliberately no persistence in the prototype) ────
const STATE = {
  dataKind: 'rich',
  favs: ['ffnow', 'load', 'bodymind', 'sleep'],   // ordered — default Favorites set
  compare: {},                                     // panelId -> bool (period compare)
  cmpSel: new Set(),                               // session comparison selection
  cmpFilter: { sport: 'all', type: 'all' },
  cmpOpen: false, cmpShow: false,
};
const D = () => DATA[STATE.dataKind];
const available = () => PANELS.filter(p => p.has(D()));
const byId = id => PANELS.find(p => p.id === id);

// ── Panel card ────────────────────────────────────────────────────────────────
function panelCard(p) {
  const fav = STATE.favs.includes(p.id);
  const cmp = !!STATE.compare[p.id];
  return `<div class="iv-panel" data-panel="${p.id}">
    <div class="iv-phead">
      <span class="iv-ptitle">${p.title}</span>
      <span class="iv-pacts">
        ${p.compare ? `<button class="iv-cbtn ${cmp ? 'on' : ''}" data-cmp="${p.id}" title="Compare vs previous period">⇄</button>` : ''}
        <button class="iv-star ${fav ? 'on' : ''}" data-star="${p.id}" title="${fav ? 'Remove from Favorites' : 'Add to Favorites'}">${fav ? '★' : '☆'}</button>
      </span>
    </div>
    <div class="iv-pbody">${p.render(D(), { compare: cmp })}</div>
  </div>`;
}

// ── Index Rail layout (prototype verdict: Variant B) ─────────────────────────
function renderRail(root) {
  const avail = available();
  const favIds = STATE.favs.filter(id => avail.some(p => p.id === id));
  const restAvail = avail.filter(p => !favIds.includes(p.id));
  const families = [...new Set(PANELS.map(p => p.family))];
  const feed = [...favIds.map(byId), ...restAvail];
  root.innerHTML = `
    <div class="iv-railwrap">
      <div class="iv-rail">
        ${favIds.length ? `<div class="iv-railgroup">★ Favorites</div>` +
          favIds.map(id => railItem(byId(id), true)).join('') : ''}
        ${families.map(f => {
          const items = restAvail.filter(p => p.family === f);
          return items.length ? `<div class="iv-railgroup">${f}</div>` + items.map(p => railItem(p, false)).join('') : '';
        }).join('')}
      </div>
      <div class="iv-feed">
        ${feed.map(p => `<div id="iv-anchor-${p.id}">${panelCard(p)}</div>`).join('')}
      </div>
    </div>`;
}
function railItem(p, fav) {
  return `<button class="iv-railitem ${fav ? 'fav' : ''}" data-jump="${p.id}">
    <span>${p.title}</span><span class="iv-star ${fav ? 'on' : ''}" data-star="${p.id}">${fav ? '★' : '☆'}</span></button>`;
}

// ── Session Comparison ────────────────────────────────────────────────────────
function renderCompareOverlay() {
  const done = D().sessions.filter(s => s.status === 'done')
    .sort((a, b) => b.date.localeCompare(a.date));
  const f = STATE.cmpFilter;
  const rows = done.filter(s => (f.sport === 'all' || s.sport === f.sport) && (f.type === 'all' || s.type === f.type));
  const sel = [...STATE.cmpSel].map(id => done.find(s => s.id === id)).filter(Boolean);

  if (STATE.cmpShow && sel.length >= 2) {
    return `<div class="iv-overlay"><div class="iv-sheet">
      <div class="iv-sheethead"><b>Session Comparison</b>
        <span><button class="iv-btn" data-cmpback="1">‹ Change selection</button>
        <button class="iv-btn" data-cmpclose="1">Close</button></span></div>
      <div class="iv-cmpcols">
        ${sel.map(s => `<div class="iv-cmpcol" style="border-top:3px solid ${TYPE_COLOR[s.type]}">
          <div class="iv-cmptitle">${s.title}</div>
          <div class="iv-cmpdate">${s.date} · <span style="color:${SPORT_COLOR[s.sport]}">${s.sport}</span> · ${s.type}</div>
          ${cmpRow('Duration', s.durMin + ' min')}
          ${cmpRow('Distance', s.km + ' km')}
          ${cmpRow('TSS', s.tss)}
          ${s.power ? cmpRow('Avg power', s.power + ' W') : ''}
          ${s.hr ? cmpRow('Avg HR', s.hr + ' bpm') : ''}
          ${cmpRow('Body', rpeChip(s.body, '#6db36d'))}
          ${cmpRow('Mind', rpeChip(s.mind, '#9a7bd0'))}
          ${s.comment ? `<div class="iv-cmpcomment">“${s.comment}”</div>` : ''}
        </div>`).join('')}
      </div>
      <div class="iv-cmpnote" style="padding:0 18px 14px;">Body & Mind next to the numbers — the part TrainingPeaks can't show.</div>
    </div></div>`;
  }

  return `<div class="iv-overlay"><div class="iv-sheet">
    <div class="iv-sheethead"><b>Compare sessions</b><button class="iv-btn" data-cmpclose="1">Close</button></div>
    <div class="iv-cmpfilters">
      <select data-cmpf="sport"><option value="all">All sports</option>${SPORTS.map(s => `<option ${f.sport === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select data-cmpf="type"><option value="all">All types</option>${Object.keys(TYPE_COLOR).map(t => `<option ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <span class="iv-hint">pick 2+ — same-kind comparisons tell the progression story</span>
    </div>
    <div class="iv-cmplist">
      <table class="iv-table iv-picker"><tr><th></th><th>Date</th><th>Session</th><th>Sport</th><th>Type</th><th>Min</th><th>TSS</th><th>Body</th><th>Mind</th></tr>
      ${rows.slice(0, 40).map(s => `<tr class="${STATE.cmpSel.has(s.id) ? 'iv-hl' : ''}">
        <td><input type="checkbox" data-cmpsel="${s.id}" ${STATE.cmpSel.has(s.id) ? 'checked' : ''}></td>
        <td>${s.date}</td><td>${s.title}</td>
        <td style="color:${SPORT_COLOR[s.sport]}">${s.sport}</td>
        <td style="color:${TYPE_COLOR[s.type]}">${s.type}</td>
        <td>${s.durMin}</td><td>${s.tss}</td><td>${s.body ?? '—'}</td><td>${s.mind ?? '—'}</td></tr>`).join('')}
      </table>
    </div>
    <div class="iv-sheetfoot"><button class="iv-btn iv-btn-go" data-cmpgo="1" ${STATE.cmpSel.size < 2 ? 'disabled' : ''}>Compare (${STATE.cmpSel.size})</button></div>
  </div></div>`;
}
function cmpRow(k, v) { return `<div class="iv-cmprow"><span>${k}</span><b>${v}</b></div>`; }
function rpeChip(v, c) { return v == null ? '—' : `<span class="iv-rpe" style="background:${c}22;color:${c};border:1px solid ${c}55">${v}/10</span>`; }

// ── Main render ───────────────────────────────────────────────────────────────
function render() {
  const view = document.getElementById('information-view');
  if (!view) return;
  view.innerHTML = `
    <div class="iv-container">
      <div class="header">
        <h1>Information</h1>
        <p>${STATE.dataKind === 'rich' ? '26 weeks of history' : 'Week 1 — the page grows as readings arrive'} · synthetic data</p>
      </div>
      <div class="iv-topbar">
        <button class="iv-btn" data-cmpopen="1">⇆ Compare sessions</button>
        <span class="iv-hint">${available().length} of ${PANELS.length} panels have a reading</span>
      </div>
      <div id="iv-root"></div>
    </div>
    ${STATE.cmpOpen ? renderCompareOverlay() : ''}
    <div class="iv-switcher">
      <button class="iv-swdata ${STATE.dataKind === 'fresh' ? 'on' : ''}" data-datakind="fresh">New athlete</button>
      <button class="iv-swdata ${STATE.dataKind === 'rich' ? 'on' : ''}" data-datakind="rich">6 months in</button>
      <span class="iv-swsep"></span>
      <span class="iv-swproto">PROTOTYPE — synthetic data</span>
    </div>`;
  renderRail(view.querySelector('#iv-root'));
}

// ── Interaction wiring (event delegation, bound once) ─────────────────────────
function bindOnce() {
  const view = document.getElementById('information-view');

  view.addEventListener('click', e => {
    const star = e.target.closest('[data-star]');
    if (star) {
      const id = star.dataset.star;
      STATE.favs = STATE.favs.includes(id)
        ? STATE.favs.filter(x => x !== id)
        : [...STATE.favs, id];
      render(); return;
    }
    const cmp = e.target.closest('[data-cmp]');
    if (cmp) { STATE.compare[cmp.dataset.cmp] = !STATE.compare[cmp.dataset.cmp]; render(); return; }

    const jump = e.target.closest('[data-jump]');
    if (jump && !e.target.closest('[data-star]')) {
      const el = view.querySelector(`#iv-anchor-${jump.dataset.jump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (e.target.closest('[data-cmpopen]'))  { STATE.cmpOpen = true;  STATE.cmpShow = false; render(); return; }
    if (e.target.closest('[data-cmpclose]')) { STATE.cmpOpen = false; render(); return; }
    if (e.target.closest('[data-cmpgo]'))    { STATE.cmpShow = true;  render(); return; }
    if (e.target.closest('[data-cmpback]'))  { STATE.cmpShow = false; render(); return; }

    const dk = e.target.closest('[data-datakind]');
    if (dk) { STATE.dataKind = dk.dataset.datakind; STATE.cmpSel.clear(); render(); return; }
  });

  view.addEventListener('change', e => {
    const selBox = e.target.closest('[data-cmpsel]');
    if (selBox) {
      const id = selBox.dataset.cmpsel;
      selBox.checked ? STATE.cmpSel.add(id) : STATE.cmpSel.delete(id);
      render(); return;
    }
    const filt = e.target.closest('[data-cmpf]');
    if (filt) { STATE.cmpFilter[filt.dataset.cmpf] = filt.value; render(); return; }
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `
#information-view .iv-container { max-width: 1060px; margin: 0 auto; }
.iv-topbar { display:flex; align-items:center; gap:14px; margin-bottom:18px; }
.iv-hint { font-size:11px; color:var(--muted); font-weight:400; }
.iv-btn { padding:7px 13px; background:var(--surface-2); border:1px solid var(--border); border-radius:7px;
  color:var(--text); font-size:12px; font-family:inherit; cursor:pointer; }
.iv-btn:hover { border-color:var(--accent-dim); }
.iv-btn:disabled { opacity:0.4; cursor:default; }
.iv-btn-go { background:var(--accent); color:#0a0a0a; font-weight:600; border-color:var(--accent); }

.iv-panel { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:16px 18px; min-width:0; }
.iv-phead { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.iv-ptitle { font-size:12px; font-weight:600; color:var(--text); }
.iv-pacts { display:flex; gap:4px; }
.iv-star, .iv-cbtn { background:none; border:none; color:var(--muted); font-size:15px; cursor:pointer; padding:2px 4px; line-height:1; }
.iv-star.on { color:var(--accent); }
.iv-cbtn { font-size:13px; border:1px solid transparent; border-radius:5px; }
.iv-cbtn.on { color:var(--accent); border-color:var(--accent-dim); }
.iv-star:hover, .iv-cbtn:hover { color:var(--text); }

.iv-legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; font-size:10px; color:var(--muted); }
.iv-legend i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:4px; }
.iv-cmpnote { font-size:10px; color:var(--muted); margin-top:6px; }

.iv-ffrow { display:flex; gap:10px; }
.iv-ffbox { flex:1; text-align:center; border:1px solid; border-radius:8px; padding:10px 4px; }
.iv-ffval { font-size:26px; font-weight:700; }
.iv-fflab { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; margin-top:2px; }
.iv-race { text-align:center; padding:6px 0; }

.iv-minigrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.iv-mini { background:var(--surface-2); border-radius:7px; padding:8px 10px; }
.iv-minihead { display:flex; justify-content:space-between; font-size:10px; color:var(--muted); margin-bottom:4px; }

.iv-donutrow { display:flex; align-items:center; gap:16px; }
.iv-donutleg { font-size:12px; color:var(--text); display:flex; flex-direction:column; gap:6px; }
.iv-donutleg i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:6px; }
.iv-donutleg span { color:var(--muted); font-size:11px; }

.iv-table { width:100%; border-collapse:collapse; font-size:11px; }
.iv-table th { text-align:right; color:var(--muted); font-weight:500; padding:4px 6px; border-bottom:1px solid var(--border); }
.iv-table td { text-align:right; color:var(--text); padding:4px 6px; }
.iv-table td:first-child, .iv-table th:first-child { text-align:left; color:var(--muted); }
.iv-table tr.iv-hl td { color:var(--accent); font-weight:600; }

.iv-railwrap { display:flex; gap:18px; align-items:flex-start; }
.iv-rail { width:210px; flex:none; position:sticky; top:20px; max-height:calc(100vh - 40px); overflow-y:auto;
  background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 8px; }
.iv-railgroup { font-size:9.5px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--accent);
  padding:10px 8px 4px; }
.iv-railitem { display:flex; justify-content:space-between; align-items:center; width:100%; text-align:left;
  background:none; border:none; color:var(--text); font-size:12px; font-family:inherit; padding:6px 8px;
  border-radius:6px; cursor:pointer; }
.iv-railitem:hover { background:var(--surface-2); }
.iv-railitem.fav span:first-child { color:var(--accent); }
.iv-feed { flex:1; display:flex; flex-direction:column; gap:14px; min-width:0; }
@media (max-width:820px){ .iv-railwrap { flex-direction:column; } .iv-rail { width:100%; position:static; } }

.iv-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:250; display:flex; align-items:center; justify-content:center; padding:20px; }
.iv-sheet { background:var(--surface); border:1px solid var(--border); border-radius:12px; width:min(860px, 100%);
  max-height:86vh; display:flex; flex-direction:column; overflow:hidden; }
.iv-sheethead { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid var(--border); }
.iv-sheethead b { font-size:14px; }
.iv-sheethead span { display:flex; gap:8px; }
.iv-cmpfilters { display:flex; gap:10px; align-items:center; padding:12px 18px 4px; }
.iv-cmpfilters select { background:var(--surface-2); border:1px solid var(--border); border-radius:6px; color:var(--text);
  font-size:12px; font-family:inherit; padding:6px 8px; }
.iv-cmplist { overflow-y:auto; padding:8px 18px; }
.iv-picker td, .iv-picker th { text-align:left; }
.iv-sheetfoot { padding:12px 18px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; }
.iv-cmpcols { display:flex; gap:12px; padding:16px 18px; overflow-x:auto; }
.iv-cmpcol { flex:1; min-width:170px; background:var(--surface-2); border-radius:10px; padding:12px 14px; }
.iv-cmptitle { font-size:13px; font-weight:600; margin-bottom:2px; }
.iv-cmpdate { font-size:10.5px; color:var(--muted); margin-bottom:10px; }
.iv-cmprow { display:flex; justify-content:space-between; font-size:12px; padding:4px 0; border-bottom:1px solid var(--border); }
.iv-cmprow span { color:var(--muted); }
.iv-cmpcomment { font-size:11px; color:var(--muted); font-style:italic; margin-top:8px; }
.iv-rpe { padding:1px 7px; border-radius:9px; font-size:11px; font-weight:600; }

.iv-switcher { position:fixed; bottom:18px; left:50%; transform:translateX(-50%); z-index:300;
  display:flex; align-items:center; gap:8px; background:#000; border:1px solid var(--border);
  border-radius:22px; padding:7px 14px; box-shadow:0 6px 24px rgba(0,0,0,0.6); }
.iv-swsep { width:1px; height:16px; background:var(--border); }
.iv-swdata { font-size:11px; color:var(--muted); background:none; border:1px solid transparent; border-radius:11px; padding:2px 9px; font-family:inherit; cursor:pointer; }
.iv-swdata.on { color:var(--accent); border-color:var(--accent-dim); }
.iv-swproto { font-size:9px; font-weight:700; letter-spacing:0.14em; color:#e05555; }
`;

// ── Boot ──────────────────────────────────────────────────────────────────────
function init() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  bindOnce();
}

document.addEventListener('DOMContentLoaded', init);

// Called by switchView('information') in app.js
window.renderInfoPrototype = render;
