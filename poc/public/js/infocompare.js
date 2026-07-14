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

// Period Comparison split: current window = the last half of the series,
// previous window = the equal-length half before it. Odd lengths give the
// extra element to the current window. Fewer than 2 points → no previous
// window (the panel degrades gracefully to current-only).
export function splitPeriods(values) {
  if (values.length < 2) return { current: [...values], previous: [] };
  const half = Math.floor(values.length / 2);
  return {
    previous: values.slice(0, half),
    current:  values.slice(half),
  };
}
