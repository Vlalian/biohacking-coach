'use client';

import { useTranslations } from 'next-intl';
import type { InfoDataset, PeaksRow } from '@/features/information-view/dataset';
import { PEAK_WINDOW_LABELS } from '@/features/information-view/dataset';
import {
  BODY_COLOR,
  FF_COLORS,
  MIND_COLOR,
  SPORT_COLOR,
  ZONE_COLORS,
  periodSplit,
  rampRates,
  sportSplit,
  weeklyAvg,
} from '@/features/information-view/panels';
import { Bars, ChartSvg, Donut, Legend, Line } from './charts';

/**
 * One renderer per panel in the catalog — the looks half of the POC's
 * `panels.js`, as React. What a panel *is* (predicate, series, selectors)
 * lives in the pure catalog; this maps its id to marks on screen.
 *
 * ADR 0004 still governs: panels show data, never Coach-derived
 * interpretation. Signs and colors are arithmetic, not judgment.
 */

export function PanelBody({ id, dataset }: { id: string; dataset: InfoDataset }) {
  switch (id) {
    case 'ffnow':
      return <FfNow D={dataset} />;
    case 'race':
      return <Race D={dataset} />;
    case 'load':
      return <Load D={dataset} />;
    case 'ramp':
      return <Ramp D={dataset} />;
    case 'consistency':
      return <Consistency D={dataset} />;
    case 'bodymind':
      return <BodyMind D={dataset} />;
    case 'checkin':
      return <Checkin D={dataset} />;
    case 'sleep':
      return <Sleep D={dataset} />;
    case 'period':
      return <Period D={dataset} />;
    case 'split-dur':
      return <Split D={dataset} metric="durMin" />;
    case 'split-dist':
      return <Split D={dataset} metric="km" />;
    case 'hours':
      return <Hours D={dataset} />;
    case 'longest':
      return <Longest D={dataset} />;
    case 'work':
      return <Work D={dataset} />;
    case 'zones':
      return <Zones D={dataset} />;
    case 'bests':
      return <Bests D={dataset} />;
    case 'peaks-power':
      return <PeaksTable rows={dataset.peaksPower} />;
    case 'peaks-hr':
      return <PeaksTable rows={dataset.peaksHr} />;
    default:
      return null;
  }
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
    {children}
  </div>
);

function FfNow({ D }: { D: InfoDataset }) {
  const l = D.weekly[D.weekly.length - 1];
  const tiles: Array<[string, number | null, string]> = [
    ['Fatigue', l?.fatigue ?? null, FF_COLORS.fatigue],
    ['Fitness', l?.fitness ?? null, FF_COLORS.fitness],
    ['Form', l?.form ?? null, FF_COLORS.form],
  ];
  return (
    <div className="flex gap-3">
      {tiles.map(([label, value, color]) => (
        <div
          key={label}
          className="flex-1 rounded-md border p-3 text-center"
          style={{ borderColor: color }}
        >
          <div className="text-2xl font-semibold" style={{ color }}>
            {value ?? '—'}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}

function Race({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  return (
    <div className="text-center">
      <div className="font-display text-3xl leading-none tracking-[0.02em] text-signal">
        {D.weeksToRace}
      </div>
      <div className="text-xs text-muted-foreground">
        {t('weeksUntil')}
        <br />
        {D.raceName}
      </div>
    </div>
  );
}

function Load({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  return (
    <>
      <ChartSvg w={300} h={110}>
        <Bars vals={D.weekly.map((w) => w.tss ?? 0)} w={300} h={110} color="rgba(107,107,107,0.25)" />
        {(['fitness', 'fatigue', 'form'] as const).map((k) => (
          <Line key={k} vals={D.weekly.map((w) => w[k] ?? 0)} w={300} h={110} color={FF_COLORS[k]} />
        ))}
      </ChartSvg>
      <Legend
        items={[
          ['Fitness', FF_COLORS.fitness],
          ['Fatigue', FF_COLORS.fatigue],
          ['Form', FF_COLORS.form],
          [t('weeklyTss'), 'rgba(107,107,107,0.5)'],
        ]}
      />
    </>
  );
}

function Ramp({ D }: { D: InfoDataset }) {
  const tiles = rampRates(D.weekly.map((w) => w.fitness ?? 0));
  return (
    <div className="flex gap-3">
      {tiles.map((tl) => {
        const color =
          tl.delta == null || tl.delta === 0 ? 'var(--muted-foreground)' : tl.delta > 0 ? '#6db36d' : '#e05555';
        const text = tl.delta == null ? '—' : `${tl.delta > 0 ? '+' : ''}${tl.delta}`;
        return (
          <div key={tl.label} className="flex-1 rounded-md border p-2 text-center">
            <div className="text-xl font-semibold" style={{ color }}>
              {text}
            </div>
            <div className="text-xs text-muted-foreground">{tl.label}</div>
            {tl.spark.length > 1 && (
              <ChartSvg w={90} h={22}>
                <Line vals={tl.spark} w={90} h={22} color={color} />
              </ChartSvg>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Consistency({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  const mx = Math.max(...D.weekly.map((w) => w.done + w.skipped), 1);
  const bw = 300 / D.weekly.length;
  const totDone = D.weekly.reduce((a, w) => a + w.done, 0);
  const totAll = D.weekly.reduce((a, w) => a + w.done + w.skipped, 0);
  return (
    <>
      <ChartSvg w={300} h={90}>
        {D.weekly.map((w, i) => {
          const hDone = (w.done / mx) * 80;
          const hSkip = (w.skipped / mx) * 80;
          return (
            <g key={w.week}>
              <rect
                x={(i * bw + 1.5).toFixed(1)}
                y={(86 - hDone).toFixed(1)}
                width={Math.max(1, bw - 3).toFixed(1)}
                height={hDone.toFixed(1)}
                rx={1.5}
                fill={BODY_COLOR}
              />
              {w.skipped > 0 && (
                <rect
                  x={(i * bw + 1.5).toFixed(1)}
                  y={(86 - hDone - hSkip - 1.5).toFixed(1)}
                  width={Math.max(1, bw - 3).toFixed(1)}
                  height={hSkip.toFixed(1)}
                  rx={1.5}
                  fill="rgba(224,85,85,0.55)"
                />
              )}
            </g>
          );
        })}
      </ChartSvg>
      <Legend
        items={[
          [t('completed'), BODY_COLOR],
          [t('skipped'), 'rgba(224,85,85,0.7)'],
        ]}
      />
      <Note>{t('consistencyNote', { done: totDone, all: totAll })}</Note>
    </>
  );
}

function BodyMind({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  return (
    <>
      <ChartSvg w={300} h={100}>
        <Line vals={weeklyAvg(D, 'body')} w={300} h={100} color={BODY_COLOR} />
        <Line vals={weeklyAvg(D, 'mind')} w={300} h={100} color={MIND_COLOR} />
      </ChartSvg>
      <Legend
        items={[
          [t('body'), BODY_COLOR],
          [t('mind'), MIND_COLOR],
        ]}
      />
      <Note>{t('weeklyAvgNote')}</Note>
    </>
  );
}

function Checkin({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  const rows: Array<['energy' | 'sleepq' | 'mood' | 'motivation', string, string]> = [
    ['energy', t('energy'), '#4fa3d9'],
    ['sleepq', t('sleepQuality'), MIND_COLOR],
    ['mood', t('mood'), BODY_COLOR],
    ['motivation', t('motivation'), '#c9a96e'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {rows.map(([key, label, color]) => {
        const vals = D.checkins.map((x) => x[key]);
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <b style={{ color }}>{vals[vals.length - 1]}</b>
            </div>
            <ChartSvg w={140} h={34}>
              <Line vals={vals} w={140} h={34} color={color} />
            </ChartSvg>
          </div>
        );
      })}
    </div>
  );
}

function Sleep({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  return (
    <>
      <ChartSvg w={300} h={100}>
        <Bars vals={D.sleep.map((x) => x.hours)} w={300} h={100} color="rgba(154,123,208,0.45)" />
        <Line vals={D.sleep.map((x) => x.feeling * 2)} w={300} h={100} color="#c9a96e" />
      </ChartSvg>
      <Legend
        items={[
          [t('sleepHours'), MIND_COLOR],
          [t('feeling'), '#c9a96e'],
        ]}
      />
    </>
  );
}

function Period({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  const split = periodSplit(D);
  if (!split) return null;
  const { current, previous } = split;
  const rows: Array<[string, number | null, number | null]> = [
    [t('hoursLabel'), current.hours, previous.hours],
    [t('completed'), current.completed, previous.completed],
    [t('skipped'), current.skipped, previous.skipped],
    [t('panelLongest'), current.longest, previous.longest],
    [t('body'), current.body, previous.body],
    [t('mind'), current.mind, previous.mind],
  ];
  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th />
            <th className="py-1 font-normal">{t('periodThis')}</th>
            <th className="py-1 font-normal">{t('periodLast')}</th>
            <th className="py-1 font-normal">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cur, prev]) => {
            const delta = cur != null && prev != null ? +(cur - prev).toFixed(1) : null;
            // Sign and color are arithmetic, never judgment (ADR 0004).
            const color =
              delta == null || delta === 0
                ? 'var(--muted-foreground)'
                : delta > 0
                  ? '#6db36d'
                  : '#e05555';
            return (
              <tr key={label}>
                <td className="py-0.5 text-muted-foreground">{label}</td>
                <td className="py-0.5 font-semibold">{cur ?? '—'}</td>
                <td className="py-0.5">{prev ?? '—'}</td>
                <td className="py-0.5" style={{ color }}>
                  {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Note>{t('periodNote', { n: split.weeks })}</Note>
    </>
  );
}

function Split({ D, metric }: { D: InfoDataset; metric: 'durMin' | 'km' }) {
  const t = useTranslations('Information');
  const parts = sportSplit(D, metric);
  const fmt = (v: number) => (metric === 'durMin' ? `${Math.round(v / 60)}h` : `${Math.round(v)} km`);
  return (
    <div className="flex items-center gap-4">
      <Donut parts={parts.map((p) => ({ v: p.value, c: p.color }))} />
      <div className="flex flex-col gap-1 text-sm">
        {parts.map((p) => (
          <div key={p.sport} className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {t(p.labelKey)} <b>{p.pct}%</b>{' '}
            <span className="text-muted-foreground">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Hours({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  const vals = D.weekly.map((w) => +(w.minutes / 60).toFixed(1));
  const avg = (vals.reduce((a, v) => a + v, 0) / (vals.length || 1)).toFixed(1);
  return (
    <>
      <ChartSvg w={300} h={90}>
        <Bars vals={vals} w={300} h={90} color="rgba(74,144,217,0.75)" />
      </ChartSvg>
      <Note>{t('avgPerWeek', { avg })}</Note>
    </>
  );
}

function Longest({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  return (
    <>
      <ChartSvg w={300} h={90}>
        <Bars vals={D.weekly.map((w) => w.longest)} w={300} h={90} color="rgba(79,163,217,0.75)" />
      </ChartSvg>
      <Note>{t('longestNote')}</Note>
    </>
  );
}

function Work({ D }: { D: InfoDataset }) {
  return (
    <ChartSvg w={300} h={90}>
      <Bars vals={D.weekly.map((w) => w.kj ?? 0)} w={300} h={90} color="rgba(107,107,107,0.6)" />
    </ChartSvg>
  );
}

function Zones({ D }: { D: InfoDataset }) {
  const rows = D.weekly.filter((w) => w.zones);
  const bw = 300 / (rows.length || 1);
  return (
    <>
      <ChartSvg w={300} h={90}>
        {rows.map((w, i) => {
          let y = 86;
          return (
            <g key={w.week}>
              {(w.zones ?? []).map((pct, z) => {
                const h = (pct / 100) * 80;
                y -= h;
                return (
                  <rect
                    key={z}
                    x={(i * bw + 1.5).toFixed(1)}
                    y={y.toFixed(1)}
                    width={Math.max(1, bw - 3).toFixed(1)}
                    height={h.toFixed(1)}
                    fill={ZONE_COLORS[z]}
                  />
                );
              })}
            </g>
          );
        })}
      </ChartSvg>
      <Legend items={ZONE_COLORS.map((c, z) => [`Z${z + 1}`, c] as [string, string])} />
    </>
  );
}

function Bests({ D }: { D: InfoDataset }) {
  const t = useTranslations('Information');
  return (
    <div className="flex flex-col gap-1.5">
      {D.bests.slice(0, 6).map((b, i) => (
        <div key={`${b.metricKey}-${i}`} className="flex items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">{b.date}</span>
          <i
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: SPORT_COLOR[b.sport] || SPORT_COLOR.other }}
          />
          <span className="flex-1">{t(b.metricKey)}</span>
          <b>{b.value}</b>
        </div>
      ))}
    </div>
  );
}

function PeaksTable({ rows }: { rows: PeaksRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th />
          {PEAK_WINDOW_LABELS.map((c) => (
            <th key={c} className="py-1 font-normal">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.label} className={i === rows.length - 1 ? 'font-semibold' : ''}>
            <td className="py-0.5">{r.label}</td>
            {PEAK_WINDOW_LABELS.map((c) => (
              <td key={c} className="py-0.5">
                {r[c] ?? '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
