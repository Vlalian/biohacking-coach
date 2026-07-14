// Panel Catalog — pure module, no DOM, no storage, no translations import.
//
// Each Panel declares: id, familyKey, titleKey, an optional compare capability,
// a one-reading predicate has(dataset), and render(dataset, opts) → HTML
// string. Labels resolve through the injected opts.t so the module stays pure
// (the orchestrator passes the real translator; tests pass identity).
//
// Rules (ADR-0004): panels show data, never Coach-derived interpretation — no
// Pattern Insights here, ever. A panel whose predicate is false must not be
// rendered at all: no dead empty-state placeholders.

// ── SVG helpers ───────────────────────────────────────────────────────────────
export function svgOpen(w, h) {
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block;">`;
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

const BODY_COLOR = '#6db36d';
const MIND_COLOR = '#9a7bd0';

// ── The catalog ───────────────────────────────────────────────────────────────
export const PANELS = [
  {
    id: 'bodymind',
    familyKey: 'infoFamilyBodyMind',
    titleKey: 'infoPanelBodyMind',
    compare: true,
    has: D => D.sessions.some(s => s.body != null || s.mind != null),
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
];

export function availablePanels(dataset) {
  return PANELS.filter(p => p.has(dataset));
}

export function panelById(id) {
  return PANELS.find(p => p.id === id);
}
