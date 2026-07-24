/**
 * The Information View dataset — the shape every panel reads.
 *
 * Ported from the POC's `infodata.js` *contract*, not its synthetic provider:
 * "nothing outside this module may fabricate Information View data" survives as
 * "every panel renders whatever dataset it is given, and only the builder in
 * `build-dataset.ts` (real rows) or the test fixtures may construct one".
 *
 * `checkins` and `sleep` have no real source yet — no table holds them — so on
 * real data they stay empty and their panels simply do not render (the
 * one-reading rule, ADR 0004). The keys exist because the shape is the contract.
 * The TSS family (`tss`, `fitness`, `fatigue`, `form`) stays null until the calc
 * module exists; panels gated on it do not render either.
 */

export type InfoSession = {
  id: string;
  date: string;
  /** Weeks before the current one: 0 = this week, counting up into the past. */
  week: number;
  title: string | null;
  /** Normalized sport bucket; null when the session has no Garmin provenance. */
  sport: string | null;
  type: string;
  durMin: number | null;
  km: number | null;
  tss: number | null;
  power: number | null;
  hr: number | null;
  kj: number | null;
  /** Session Reflection on the panel axis: RPE-style 1–10 (stored 1–5, ×2). */
  body: number | null;
  mind: number | null;
  comment: string;
  status: 'done' | 'skipped';
};

export type WeeklyRow = {
  week: number;
  tss: number | null;
  minutes: number;
  kj: number | null;
  done: number;
  skipped: number;
  fitness: number | null;
  fatigue: number | null;
  form: number | null;
  /** % of samples in Z1..Z5; null when no HR stream covered the week. */
  zones: number[] | null;
  longest: number;
};

export type CheckinRow = {
  week: number;
  energy: number;
  sleepq: number;
  mood: number;
  motivation: number;
};

export type SleepRow = { day: number; hours: number; feeling: number };

export const PEAK_WINDOW_LABELS = ['5s', '1m', '5m', '20m', '60m'] as const;
export type PeakWindowLabel = (typeof PEAK_WINDOW_LABELS)[number];

export type PeaksRow = { label: string } & Partial<
  Record<PeakWindowLabel, number>
>;

export type BestRow = {
  date: string;
  week: number;
  metricKey: string;
  sport: string;
  value: string;
};

export type InfoDataset = {
  kind: string;
  sessions: InfoSession[];
  /** Oldest → newest; `week` counts down toward 0 = now. */
  weekly: WeeklyRow[];
  checkins: CheckinRow[];
  sleep: SleepRow[];
  peaksPower: PeaksRow[];
  peaksHr: PeaksRow[];
  /** Newest first. */
  bests: BestRow[];
  weeksToRace: number | null;
  raceName: string;
};

/**
 * The canonical (empty) dataset. Panel predicates and renderers may rely on
 * every key existing; tests build one-reading datasets from this.
 */
export function emptyDataset(): InfoDataset {
  return {
    kind: 'empty',
    sessions: [],
    weekly: [],
    checkins: [],
    sleep: [],
    peaksPower: [],
    peaksHr: [],
    bests: [],
    weeksToRace: null,
    raceName: '',
  };
}

/**
 * Clips a dataset to the last `weeks` weeks — the single place windowing
 * happens; panels render whatever they are given. Week numbers count down
 * toward now (0 = current), so "last N weeks" keeps entries with `week < N`.
 * Sleep is daily (day counts down too); peaks are monthly bests, clipped to
 * ~one row per 4 weeks of window. Race facts are about the future and are
 * never clipped.
 */
export function windowDataset(
  dataset: InfoDataset,
  weeks: number | null,
): InfoDataset {
  if (weeks == null) return dataset; // 'all history'
  const months = Math.max(1, Math.ceil(weeks / 4));
  return {
    ...dataset,
    sessions: dataset.sessions.filter((s) => s.week < weeks),
    weekly: dataset.weekly.filter((w) => w.week < weeks),
    checkins: dataset.checkins.filter((c) => c.week < weeks),
    sleep: dataset.sleep.filter((d) => d.day < weeks * 7),
    peaksPower: dataset.peaksPower.slice(-months),
    peaksHr: dataset.peaksHr.slice(-months),
    bests: dataset.bests.filter((b) => b.week < weeks),
  };
}
