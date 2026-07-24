import type { InfoSession } from './dataset';

/**
 * Comparison logic — pure module, no DOM, no storage. Ported from the POC's
 * `infocompare.js`.
 *
 * Owns the Session Comparison rules: picker filtering, the 2+ selection
 * threshold, and attribute extraction for side-by-side columns (Body and Mind
 * Feedback always present — how it felt next to what was done is the
 * differentiator). The overlay rendering stays in the view components.
 */

export type CompareFilter = { sport?: string; type?: string };

/**
 * Completed sessions only, newest first, filtered by sport and Session Type
 * ('all' disables a filter). Guide, don't forbid: any completed session is
 * selectable — the filters just make same-kind comparison the natural path.
 */
export function filterSessions(
  sessions: InfoSession[],
  { sport = 'all', type = 'all' }: CompareFilter = {},
): InfoSession[] {
  return sessions
    .filter((s) => s.status === 'done')
    .filter(
      (s) =>
        (sport === 'all' || s.sport === sport) &&
        (type === 'all' || s.type === type),
    )
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function canCompare(selectedIds: string[]): boolean {
  return selectedIds.length >= 2;
}

export type CompareColumn = {
  id: string;
  title: string | null;
  date: string;
  sport: string | null;
  type: string;
  /** [labelKey, value] pairs; 'TSS' renders literally, other keys translate. */
  rows: Array<[string, string]>;
  body: number | null;
  mind: number | null;
  comment: string;
};

/**
 * One column per session: fixed rows (labelKey → value), optional metrics
 * omitted rather than rendered blank, Body/Mind always present. Wider than the
 * POC's omission rule by necessity: on real data duration, distance, and TSS
 * can also be absent (a session without Garmin provenance, TSS until the calc
 * module exists), so every numeric row is present-or-omitted, never blank.
 */
export function extractColumns(sessions: InfoSession[]): CompareColumn[] {
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    sport: s.sport,
    type: s.type,
    rows: [
      ...(s.durMin != null
        ? [['duration', `${s.durMin} min`] as [string, string]]
        : []),
      ...(s.km != null ? [['distance', `${s.km} km`] as [string, string]] : []),
      ...(s.tss != null ? [['TSS', String(s.tss)] as [string, string]] : []),
      ...(s.power != null
        ? [['avgPower', `${s.power} W`] as [string, string]]
        : []),
      ...(s.hr != null ? [['avgHr', `${s.hr} bpm`] as [string, string]] : []),
    ],
    body: s.body,
    mind: s.mind,
    comment: s.comment || '',
  }));
}

/**
 * Comparison Graph normalization: scale a series to 0–1 over its own range,
 * so series with different units (hours, RPE, kJ) can share one chart — the
 * comparison is of shapes over time, not absolute values. A flat series (or a
 * single reading) maps to 0.5 — a midline, not a crash.
 */
export function normalize(values: number[]): number[] {
  if (!values.length) return [];
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  if (mx === mn) return values.map(() => 0.5);
  return values.map((v) => (v - mn) / (mx - mn));
}
