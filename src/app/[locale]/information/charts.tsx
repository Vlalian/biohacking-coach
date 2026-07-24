import type { ReactNode } from 'react';

/**
 * SVG chart primitives for the Information View panels, ported from the POC's
 * `panels.js` helpers. Purely presentational: values in, marks out.
 *
 * Charts scale with their container: `aspect-ratio` keeps the viewBox
 * proportions, so a panel spanning a wider grid cell renders taller too —
 * this is what makes Enlarge work without per-panel sizes.
 */

export function ChartSvg({
  w,
  h,
  children,
}: {
  w: number;
  h: number;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 'auto', aspectRatio: `${w}/${h}`, display: 'block' }}
    >
      {children}
    </svg>
  );
}

function pathFor(vals: number[], w: number, h: number, pad = 4): string {
  if (!vals.length) return '';
  const mx = Math.max(...vals, 1);
  const mn = Math.min(...vals, 0);
  const sx = (i: number) =>
    vals.length === 1 ? w / 2 : pad + (i / (vals.length - 1)) * (w - 2 * pad);
  const sy = (v: number) => h - pad - ((v - mn) / (mx - mn || 1)) * (h - 2 * pad);
  return vals
    .map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`)
    .join(' ');
}

/** One reading renders as a dot, not a degenerate path. */
export function Line({
  vals,
  w,
  h,
  color,
}: {
  vals: number[];
  w: number;
  h: number;
  color: string;
}) {
  if (!vals.length) return null;
  if (vals.length === 1) return <circle cx={w / 2} cy={h / 2} r={3.5} fill={color} />;
  return <path d={pathFor(vals, w, h)} fill="none" stroke={color} strokeWidth={2} />;
}

export function Bars({
  vals,
  w,
  h,
  color,
  pad = 2,
}: {
  vals: number[];
  w: number;
  h: number;
  color: string;
  pad?: number;
}) {
  if (!vals.length) return null;
  const mx = Math.max(...vals, 1);
  const bw = w / vals.length;
  return (
    <>
      {vals.map((v, i) => (
        <rect
          key={i}
          x={(i * bw + pad).toFixed(1)}
          y={(h - (v / mx) * (h - 4)).toFixed(1)}
          width={Math.max(1, bw - 2 * pad).toFixed(1)}
          height={((v / mx) * (h - 4)).toFixed(1)}
          rx={1.5}
          fill={color}
        />
      ))}
    </>
  );
}

export function Donut({
  parts,
  size = 110,
}: {
  parts: Array<{ v: number; c: string }>;
  size?: number;
}) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  // Precompute each segment's start offset — cumulative sums, not render-time
  // mutation.
  const segments = parts.map((p, i) => ({
    ...p,
    frac: p.v / total,
    start: parts.slice(0, i).reduce((a, q) => a + q.v / total, 0),
  }));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flex: 'none' }}>
      {segments.map((p, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={p.c}
          strokeWidth={14}
          strokeDasharray={`${(p.frac * C).toFixed(1)} ${(C - p.frac * C).toFixed(1)}`}
          strokeDashoffset={(-p.start * C).toFixed(1)}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
