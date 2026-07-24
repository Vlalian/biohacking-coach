import type { InfoDataset } from './dataset';

/**
 * The Panel Catalog — pure module, no DOM, no storage, no translations.
 * Ported from the POC's `panels.js`, with rendering split out: this module
 * owns what a panel *is* (identity, family, one-reading predicate, Comparison
 * Graph series, data selectors); the React components in the app layer own
 * what it looks like.
 *
 * Rules (ADR 0004): panels show data, never Coach-derived interpretation — no
 * Pattern Insights here, ever. A panel whose predicate is false must not be
 * rendered at all: no dead empty-state placeholders. A panel renders as soon
 * as ONE reading exists (Progressive Disclosure, one-reading rule).
 *
 * Catalog array order = feed order: Form & Load, Body & Mind, Volume,
 * Peaks & Zones. Technical sports terms (TSS, RPE, W, bpm, kJ, Z1–Z5,
 * Fatigue/Fitness/Form) stay in English in every Athlete Language.
 *
 * `titleKey`, `familyKey`, and series `labelKey` resolve inside the app's
 * `Information` message namespace.
 */

export type PanelSeries = {
  labelKey: string;
  color: string;
  values: number[];
};

export type Panel = {
  id: string;
  familyKey: string;
  titleKey: string;
  /** The one-reading predicate: true as soon as a single data point exists. */
  has: (dataset: InfoDataset) => boolean;
  /** Time series for the Comparison Graph; absent on tiles, tables, donuts. */
  series?: (dataset: InfoDataset) => PanelSeries[];
};

export const FF_COLORS = {
  fatigue: '#e05555',
  fitness: '#4a90d9',
  form: '#c9a96e',
} as const;
export const BODY_COLOR = '#6db36d';
export const MIND_COLOR = '#9a7bd0';
export const SPORT_COLOR: Record<string, string> = {
  swim: '#4fa3d9',
  bike: '#c9a96e',
  run: '#6db36d',
  strength: '#9a7bd0',
  other: '#6b6b6b',
};
/** Sport bucket → label key in the Information namespace. */
export const SPORT_KEY: Record<string, string> = {
  swim: 'swim',
  bike: 'bike',
  run: 'run',
  other: 'other',
};
export const ZONE_COLORS = ['#6db36d', '#4a90d9', '#c9a96e', '#e08b55', '#e05555'];

// ── Shared dataset selectors ─────────────────────────────────────────────────

/**
 * Weekly averages of a Session Reflection dimension ('body' | 'mind'),
 * oldest → newest.
 */
export function weeklyAvg(dataset: InfoDataset, key: 'body' | 'mind'): number[] {
  const byWeek = new Map<number, number[]>();
  for (const s of dataset.sessions) {
    const v = s[key];
    if (v == null) continue;
    if (!byWeek.has(s.week)) byWeek.set(s.week, []);
    byWeek.get(s.week)!.push(v);
  }
  return [...byWeek.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, arr]) => +(arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(1));
}

export type RampTile = {
  label: string;
  delta: number | null;
  spark: number[];
};

/**
 * Ramp rates: fitness change over trailing windows (in weeks of the weekly
 * series). A window renders only when the series fully covers it; when no
 * window fits (single reading), one tile shows the shortest window with no
 * delta — present, honest, empty of judgment.
 */
export function rampRates(values: number[]): RampTile[] {
  const WINDOWS: Array<[number, string]> = [
    [1, '7d'],
    [4, '28d'],
    [13, '90d'],
    [52, '365d'],
  ];
  const len = values.length;
  const tiles = WINDOWS.filter(([w]) => len - 1 >= w).map(([w, label]) => ({
    label,
    delta: +(values[len - 1] - values[len - 1 - w]).toFixed(0),
    spark: values.slice(len - 1 - w),
  }));
  if (!tiles.length && len) return [{ label: '7d', delta: null, spark: [...values] }];
  return tiles;
}

export type SportSplitPart = {
  sport: string;
  value: number;
  pct: number;
  color: string;
  labelKey: string;
};

/**
 * Completed-session totals of a numeric field, grouped by sport bucket.
 * Sessions without Garmin provenance have no sport and group under 'other' —
 * real plans contain them, so the donut must not silently drop their volume.
 */
export function sportSplit(
  dataset: InfoDataset,
  key: 'durMin' | 'km',
): SportSplitPart[] {
  const totals = new Map<string, number>();
  for (const s of dataset.sessions) {
    if (s.status !== 'done') continue;
    const sport = s.sport || 'other';
    totals.set(sport, (totals.get(sport) || 0) + (s[key] || 0));
  }
  const sum = [...totals.values()].reduce((a, v) => a + v, 0) || 1;
  return [...totals.entries()].map(([sport, value]) => ({
    sport,
    value,
    pct: Math.round((value / sum) * 100),
    color: SPORT_COLOR[sport] || SPORT_COLOR.other,
    labelKey: SPORT_KEY[sport] || SPORT_KEY.other,
  }));
}

export type PeriodAggregates = {
  hours: number;
  completed: number;
  skipped: number;
  longest: number;
  body: number | null;
  mind: number | null;
};

export type PeriodComparison = {
  /** Whole weeks per block. */
  weeks: number;
  current: PeriodAggregates;
  previous: PeriodAggregates;
};

/**
 * Period Comparison (ADR 0004's second pillar): this block against the last.
 * The block is half the dataset the athlete is looking at — window to the last
 * 4 weeks and the split is 2 vs 2; on all-history it is the newest half
 * against the half before it. Pure arithmetic on what each block holds; null
 * when there isn't a full block on each side to compare.
 */
export function periodSplit(dataset: InfoDataset): PeriodComparison | null {
  const k = Math.floor(dataset.weekly.length / 2);
  if (k < 1) return null;

  const block = (lo: number, hi: number): PeriodAggregates => {
    const weeks = dataset.weekly.filter((w) => w.week >= lo && w.week < hi);
    const sessions = dataset.sessions.filter((s) => s.week >= lo && s.week < hi);
    const avg = (key: 'body' | 'mind'): number | null => {
      const vals = sessions
        .map((s) => s[key])
        .filter((v): v is number => v != null);
      return vals.length
        ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
        : null;
    };
    return {
      hours: +(weeks.reduce((a, w) => a + w.minutes, 0) / 60).toFixed(1),
      completed: weeks.reduce((a, w) => a + w.done, 0),
      skipped: weeks.reduce((a, w) => a + w.skipped, 0),
      longest: Math.max(0, ...weeks.map((w) => w.longest)),
      body: avg('body'),
      mind: avg('mind'),
    };
  };

  return { weeks: k, current: block(0, k), previous: block(k, 2 * k) };
}

const FAMILY = {
  formLoad: 'familyFormLoad',
  bodyMind: 'familyBodyMind',
  volume: 'familyVolume',
  peaks: 'familyPeaks',
};

// ── The catalog ──────────────────────────────────────────────────────────────
export const PANELS: Panel[] = [
  // ── Form & Load ──
  {
    id: 'ffnow',
    familyKey: FAMILY.formLoad,
    titleKey: 'panelFormToday',
    // Fitness/fatigue are TSS-derived: null on real data until the calc module.
    has: (D) => D.weekly.some((w) => w.fitness != null),
  },
  {
    id: 'race',
    familyKey: FAMILY.formLoad,
    titleKey: 'panelRace',
    has: (D) => D.weeksToRace != null,
  },
  {
    id: 'load',
    familyKey: FAMILY.formLoad,
    titleKey: 'panelLoad',
    has: (D) => D.weekly.some((w) => w.fitness != null),
    series: (D) => [
      { labelKey: 'fitness', color: FF_COLORS.fitness, values: D.weekly.map((w) => w.fitness ?? 0) },
      { labelKey: 'fatigue', color: FF_COLORS.fatigue, values: D.weekly.map((w) => w.fatigue ?? 0) },
      { labelKey: 'form', color: FF_COLORS.form, values: D.weekly.map((w) => w.form ?? 0) },
    ],
  },
  {
    // "Building or fading?" — arithmetic only: the sign and color are math,
    // never judgment or advice.
    id: 'ramp',
    familyKey: FAMILY.formLoad,
    titleKey: 'panelRamp',
    has: (D) => D.weekly.some((w) => w.fitness != null),
  },
  {
    id: 'consistency',
    familyKey: FAMILY.formLoad,
    titleKey: 'panelConsistency',
    has: (D) => D.weekly.length > 0,
    series: (D) => [
      { labelKey: 'completed', color: BODY_COLOR, values: D.weekly.map((w) => w.done) },
    ],
  },

  // ── Body & Mind ──
  {
    id: 'bodymind',
    familyKey: FAMILY.bodyMind,
    titleKey: 'panelBodyMind',
    has: (D) => D.sessions.some((s) => s.body != null || s.mind != null),
    series: (D) => [
      { labelKey: 'body', color: BODY_COLOR, values: weeklyAvg(D, 'body') },
      { labelKey: 'mind', color: MIND_COLOR, values: weeklyAvg(D, 'mind') },
    ],
  },
  {
    id: 'checkin',
    familyKey: FAMILY.bodyMind,
    titleKey: 'panelCheckin',
    has: (D) => D.checkins.length > 0,
    series: (D) => [
      { labelKey: 'energy', color: '#4fa3d9', values: D.checkins.map((x) => x.energy) },
      { labelKey: 'sleepQuality', color: MIND_COLOR, values: D.checkins.map((x) => x.sleepq) },
      { labelKey: 'mood', color: BODY_COLOR, values: D.checkins.map((x) => x.mood) },
      { labelKey: 'motivation', color: '#c9a96e', values: D.checkins.map((x) => x.motivation) },
    ],
  },
  {
    id: 'sleep',
    familyKey: FAMILY.bodyMind,
    titleKey: 'panelSleep',
    has: (D) => D.sleep.length > 0,
    series: (D) => [
      { labelKey: 'sleepHours', color: MIND_COLOR, values: D.sleep.map((x) => x.hours) },
      { labelKey: 'feeling', color: '#c9a96e', values: D.sleep.map((x) => x.feeling) },
    ],
  },

  // ── Volume ──
  {
    // This block against the last — renders only once both blocks exist.
    id: 'period',
    familyKey: FAMILY.volume,
    titleKey: 'panelPeriod',
    has: (D) => periodSplit(D) != null,
  },
  {
    id: 'split-dur',
    familyKey: FAMILY.volume,
    titleKey: 'panelSplitDur',
    has: (D) => D.sessions.some((s) => s.status === 'done'),
  },
  {
    id: 'split-dist',
    familyKey: FAMILY.volume,
    titleKey: 'panelSplitDist',
    has: (D) => D.sessions.some((s) => s.status === 'done'),
  },
  {
    id: 'hours',
    familyKey: FAMILY.volume,
    titleKey: 'panelHours',
    has: (D) => D.weekly.length > 0,
    series: (D) => [
      {
        labelKey: 'panelHours',
        color: '#4a90d9',
        values: D.weekly.map((w) => +(w.minutes / 60).toFixed(1)),
      },
    ],
  },
  {
    id: 'longest',
    familyKey: FAMILY.volume,
    titleKey: 'panelLongest',
    has: (D) => D.weekly.some((w) => w.longest > 0),
    series: (D) => [
      { labelKey: 'panelLongest', color: '#4fa3d9', values: D.weekly.map((w) => w.longest) },
    ],
  },
  {
    id: 'work',
    familyKey: FAMILY.volume,
    titleKey: 'panelWork',
    has: (D) => D.weekly.some((w) => (w.kj ?? 0) > 0),
    series: (D) => [
      { labelKey: 'panelWork', color: '#6b6b6b', values: D.weekly.map((w) => w.kj ?? 0) },
    ],
  },

  // ── Peaks & Zones (wearable-dependent) ──
  {
    id: 'zones',
    familyKey: FAMILY.peaks,
    titleKey: 'panelZones',
    has: (D) => D.weekly.some((w) => w.zones),
  },
  {
    // A feed of the moments, not a table of the numbers. Data only:
    // celebrating a PB is the Coach's job in conversation, not the panel's.
    id: 'bests',
    familyKey: FAMILY.peaks,
    titleKey: 'panelBests',
    has: (D) => D.bests.length > 0,
  },
  {
    id: 'peaks-power',
    familyKey: FAMILY.peaks,
    titleKey: 'panelPeakPower',
    has: (D) => D.peaksPower.length > 0,
  },
  {
    id: 'peaks-hr',
    familyKey: FAMILY.peaks,
    titleKey: 'panelPeakHr',
    has: (D) => D.peaksHr.length > 0,
  },
];

export const PANEL_IDS = PANELS.map((p) => p.id);

export function availablePanels(dataset: InfoDataset): Panel[] {
  return PANELS.filter((p) => p.has(dataset));
}

export function panelById(id: string): Panel | undefined {
  return PANELS.find((p) => p.id === id);
}
