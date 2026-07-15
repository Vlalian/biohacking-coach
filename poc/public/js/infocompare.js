// Comparison logic — pure module, no DOM, no storage.
//
// Owns the Session Comparison rules: picker filtering, the 2+ selection
// threshold, and attribute extraction for side-by-side columns (Body and
// Mind Feedback always present — how it felt next to what was done is the
// differentiator). Also owns the period-split math for Period Comparison
// (issue 07). The overlay/panel rendering stays in the orchestrator.

// Completed sessions only, newest first, filtered by sport and Session Type
// ('all' disables a filter). Guide, don't forbid: any completed session is
// selectable — the filters just make same-kind comparison the natural path.
export function filterSessions(sessions, { sport = 'all', type = 'all' } = {}) {
  return sessions
    .filter(s => s.status === 'done')
    .filter(s => (sport === 'all' || s.sport === sport) && (type === 'all' || s.type === type))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function canCompare(selectedIds) {
  return selectedIds.length >= 2;
}

// One column per session: fixed rows (labelKey → value), optional metrics
// omitted rather than rendered blank, Body/Mind always present.
export function extractColumns(sessions) {
  return sessions.map(s => ({
    id: s.id,
    title: s.title,
    date: s.date,
    sport: s.sport,
    type: s.type,
    rows: [
      ['infoDuration', `${s.durMin} min`],
      ['infoDistance', `${s.km} km`],
      ['TSS', String(s.tss)],
      ...(s.power != null ? [['infoAvgPower', `${s.power} W`]] : []),
      ...(s.hr != null ? [['infoAvgHr', `${s.hr} bpm`]] : []),
    ],
    body: s.body,
    mind: s.mind,
    comment: s.comment || '',
  }));
}

// Comparison Graph normalization: scale a series to 0–1 over its own range,
// so series with different units (hours, RPE, TSS, kJ) can share one chart —
// the comparison is of shapes over time, not absolute values. A flat series
// (or a single reading) maps to 0.5 — a midline, not a crash.
export function normalize(values) {
  if (!values.length) return [];
  const mn = Math.min(...values), mx = Math.max(...values);
  if (mx === mn) return values.map(() => 0.5);
  return values.map(v => (v - mn) / (mx - mn));
}
