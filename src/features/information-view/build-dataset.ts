import { weekStartOf } from '@/lib/date';
import {
  emptyDataset,
  PEAK_WINDOW_LABELS,
  type InfoDataset,
  type PeakWindowLabel,
  type PeaksRow,
} from './dataset';

/**
 * Builds the Information View dataset from the athlete's real rows — the
 * plug-in moment the POC's synthetic seam was built for. Pure: plain data in,
 * dataset out; the repository does the reading, this module does the shaping.
 *
 * TSS-family values (tss, fitness, fatigue, form) stay null until the calc
 * module exists — panels gated on them simply don't render. Check-ins, sleep,
 * and the race countdown have no source yet and stay empty for the same
 * honest reason.
 */

/** What the builder needs of a session row — the repository narrows to this. */
export type SessionInput = {
  id: string;
  date: string;
  status: string;
  isTraining: boolean;
  type: string;
  title: string | null;
  duration: number | null;
  sport: string | null;
  summary: unknown;
  feedbackBody: number | null;
  feedbackMind: number | null;
  feedbackComment: string | null;
};

/** Per-sample streams for the sessions that have them, keyed by session id. */
export type StreamsInput = Record<
  string,
  { t: number[]; hr?: (number | null)[]; powerW?: (number | null)[] }
>;

/** Raw Garmin sport strings → the sport buckets the panels group by. */
const SPORT_FROM_RAW: Record<string, string> = {
  running: 'run',
  trail_running: 'run',
  treadmill_running: 'run',
  cycling: 'bike',
  biking: 'bike',
  virtual_ride: 'bike',
  swimming: 'swim',
  open_water: 'swim',
  lap_swimming: 'swim',
};

/**
 * Rolling-mean peak windows in 10 s bins (the stream resolution the parser
 * emits and `session_streams` stores). The '5s' column is approximated by a
 * single 10 s bin — the resolution floor; honest enough for now.
 */
const PEAK_WINDOWS: Array<[PeakWindowLabel, number]> = [
  ['5s', 1],
  ['1m', 6],
  ['5m', 30],
  ['20m', 120],
  ['60m', 360],
];

/** HR zone band edges as fractions of observed max HR, Z1..Z5. */
const ZONE_EDGES = [0.6, 0.7, 0.8, 0.9];

type SummaryLike = {
  avgHr?: unknown;
  maxHr?: unknown;
  avgPowerW?: unknown;
  distanceM?: unknown;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function summaryOf(s: SessionInput): SummaryLike {
  return s.summary && typeof s.summary === 'object'
    ? (s.summary as SummaryLike)
    : {};
}

/** Best rolling mean over `win` consecutive bins; null when the series is shorter. */
export function bestRollingMean(
  values: Array<number | null | undefined>,
  win: number,
): number | null {
  const vals = values.map((v) => (typeof v === 'number' ? v : 0));
  if (vals.length < win) return null;
  let sum = 0;
  let best = -Infinity;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= win) sum -= vals[i - win];
    if (i >= win - 1) best = Math.max(best, sum / win);
  }
  return Math.round(best);
}

const WEEK_MS = 7 * 86400000;

export function buildDataset(
  rows: SessionInput[],
  streams: StreamsInput,
  todayKey: string,
): InfoDataset {
  const D = emptyDataset();
  D.kind = 'mine';

  const refWeekStart = new Date(weekStartOf(todayKey) + 'T00:00:00').getTime();
  const weekIndex = (dateKey: string) =>
    Math.max(
      0,
      Math.round(
        (refWeekStart - new Date(weekStartOf(dateKey) + 'T00:00:00').getTime()) /
          WEEK_MS,
      ),
    );

  // The training record only: past-or-today sessions that were completed or
  // skipped. The plan's future is the calendar's story, not this view's.
  const entities = rows.filter(
    (s) =>
      s.date <= todayKey &&
      (s.status === 'completed' || s.status === 'skipped') &&
      s.isTraining,
  );
  if (entities.length === 0) return D;

  // Observed max HR across everything — the zone-band anchor. Stand-in until
  // real zones come from field tests via the future calc module.
  let maxHr = 0;
  for (const e of entities) {
    const hr = streams[e.id]?.hr;
    for (const v of hr || []) if (typeof v === 'number' && v > maxHr) maxHr = v;
    const summaryMax = num(summaryOf(e).maxHr);
    if (summaryMax != null && summaryMax > maxHr) maxHr = summaryMax;
  }

  for (const e of entities
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))) {
    const s = summaryOf(e);
    const durMin = e.duration;
    const power = num(s.avgPowerW);
    const distanceM = num(s.distanceM);
    D.sessions.push({
      id: e.id,
      date: e.date,
      week: weekIndex(e.date),
      title: e.title,
      sport: SPORT_FROM_RAW[(e.sport || '').toLowerCase()] || null,
      type: e.type,
      durMin,
      km: distanceM != null ? +(distanceM / 1000).toFixed(1) : null,
      tss: null,
      power,
      hr: num(s.avgHr),
      kj:
        power != null && durMin != null
          ? Math.round((power * durMin * 60) / 1000)
          : null,
      // Session Reflection is stored 1–5; the panel axis is RPE-style 1–10.
      body: e.feedbackBody != null ? e.feedbackBody * 2 : null,
      mind: e.feedbackMind != null ? e.feedbackMind * 2 : null,
      comment: e.feedbackComment || '',
      status: e.status === 'skipped' ? 'skipped' : 'done',
    });
  }

  const maxWeek = Math.max(...D.sessions.map((s) => s.week));
  for (let w = maxWeek; w >= 0; w--) {
    const inWeek = D.sessions.filter((s) => s.week === w);
    const done = inWeek.filter((s) => s.status === 'done');
    const kj = done.reduce((a, s) => a + (s.kj || 0), 0);

    // Zone distribution from the HR streams of this week's sessions.
    let zones: number[] | null = null;
    if (maxHr > 0) {
      const bands = [0, 0, 0, 0, 0];
      let n = 0;
      for (const s of inWeek) {
        const hr = streams[s.id]?.hr;
        if (!hr) continue;
        for (const v of hr) {
          if (typeof v !== 'number') continue;
          const pct = v / maxHr;
          const band = ZONE_EDGES.findIndex((edge) => pct < edge);
          bands[band === -1 ? 4 : band]++;
          n++;
        }
      }
      if (n > 0) zones = bands.map((b) => Math.round((b / n) * 100));
    }

    D.weekly.push({
      week: w,
      tss: null,
      minutes: done.reduce((a, s) => a + (s.durMin || 0), 0),
      kj: kj > 0 ? kj : null,
      done: done.length,
      skipped: inWeek.filter((s) => s.status === 'skipped').length,
      fitness: null,
      fatigue: null,
      form: null,
      zones,
      longest: Math.max(0, ...done.map((s) => s.durMin || 0)),
    });
  }

  buildPeaksAndBests(D, streams);
  return D;
}

/**
 * Peaks: best rolling means per month, oldest → newest. Bests: the dated
 * moment each all-time peak was set, newest first — a feed of the moments,
 * not a table of the numbers.
 */
function buildPeaksAndBests(D: InfoDataset, streams: StreamsInput): void {
  const monthly = {
    power: new Map<string, PeaksRow>(),
    hr: new Map<string, PeaksRow>(),
  };
  const alltime: Record<
    string,
    { value: number; date: string; week: number; sport: string | null }
  > = {};

  const byDate = D.sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const s of byDate) {
    const st = streams[s.id];
    if (!st) continue;
    const month = new Date(s.date + 'T00:00:00').toLocaleString('en', {
      month: 'short',
    });
    const channels: Array<['powerW' | 'hr', 'power' | 'hr']> = [
      ['powerW', 'power'],
      ['hr', 'hr'],
    ];
    for (const [chan, key] of channels) {
      const series = st[chan];
      if (!series) continue;
      let row = monthly[key].get(month);
      if (!row) {
        row = { label: month };
        monthly[key].set(month, row);
      }
      for (const [label, win] of PEAK_WINDOWS) {
        const best = bestRollingMean(series, win);
        if (best == null) continue;
        if (row[label] == null || best > row[label]) row[label] = best;
        const atKey = `${key}-${label}`;
        if (!alltime[atKey] || best > alltime[atKey].value) {
          alltime[atKey] = { value: best, date: s.date, week: s.week, sport: s.sport };
        }
      }
    }
  }
  D.peaksPower = [...monthly.power.values()];
  D.peaksHr = [...monthly.hr.values()];

  const BEST_METRIC_KEYS: Record<string, string> = {
    'power-5s': 'bestPower5s',
    'power-1m': 'bestPower1m',
    'hr-5s': 'bestHr5s',
  };
  for (const [atKey, metricKey] of Object.entries(BEST_METRIC_KEYS)) {
    const b = alltime[atKey];
    if (!b) continue;
    const unit = atKey.startsWith('power') ? 'W' : 'bpm';
    D.bests.push({
      date: b.date,
      week: b.week,
      metricKey,
      sport: b.sport || 'run',
      value: `${b.value} ${unit}`,
    });
  }
  D.bests.sort((a, b) => b.date.localeCompare(a.date));
}

// Re-export so panel/table code can size columns without re-declaring them.
export { PEAK_WINDOW_LABELS };
