'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { InfoDataset, InfoSession } from '@/features/information-view/dataset';
import {
  demote,
  isFavorite,
  promote,
  reorder,
  type InformationViewLayout,
  type RangeKey,
} from '@/features/information-view/layout';
import {
  PANELS,
  SPORT_COLOR,
  SPORT_KEY,
  type Panel,
} from '@/features/information-view/panels';
import { FILTERABLE_TYPES, TYPE_COLORS } from '@/features/session/type-colors';
import {
  canCompare,
  extractColumns,
  filterSessions,
  normalize,
  type CompareFilter,
} from '@/features/information-view/compare';
import { buildViewModel } from '@/features/information-view/view-model';
import { ChartSvg, Legend, Line } from './charts';
import { PanelBody } from './panel-body';
import { saveLayoutAction } from './layout-actions';

/**
 * The Information View — thin orchestrator, ported from the POC's
 * `infoview.js`. Index rail (★ Favorites first, then panel families) beside a
 * feed of large panels. Keeps no domain logic of its own: the view-model math,
 * layout operations, and comparison rules all live in the pure feature
 * modules; this component holds view state and calls them.
 *
 * Favorites and the time range are lasting preferences persisted server-side;
 * the Comparison Graph and Enlarge are viewing modes and deliberately are not.
 */

const RANGE_KEYS: RangeKey[] = ['r4', 'r12', 'all'];

export function InformationView({
  dataset,
  initialLayout,
}: {
  dataset: InfoDataset;
  initialLayout: InformationViewLayout;
}) {
  const t = useTranslations('Information');
  const [favorites, setFavorites] = useState(initialLayout.favorites);
  const [range, setRange] = useState<RangeKey>(initialLayout.range);
  const [graphIds, setGraphIds] = useState<string[]>([]);
  const [enlarged, setEnlarged] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  const vm = useMemo(
    () => buildViewModel(dataset, favorites, range),
    [dataset, favorites, range],
  );

  // Optimistic persistence: the UI reflects the change now; the row catches up.
  const persist = (favs: string[], rng: RangeKey) =>
    startTransition(async () => {
      await saveLayoutAction(favs, rng);
    });

  const toggleFavorite = (id: string) => {
    const next = isFavorite(favorites, id) ? demote(favorites, id) : promote(favorites, id);
    setFavorites(next);
    persist(next, range);
  };

  const pickRange = (rng: RangeKey) => {
    setRange(rng);
    persist(favorites, rng);
  };

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  // ── Favorites drag-reorder — pointer-event drag (Session Move pattern) ─────
  // Scoped to the ★ group: both the dragged id and the target must be
  // favorites, otherwise the drop bounces silently.
  const drag = useRef<{ id: string; startX: number; startY: number; active: boolean } | null>(null);
  const justDragged = useRef(false);
  const [dropHover, setDropHover] = useState<string | null>(null);

  const handleFavoriteDrop = (dragId: string, targetId: string): 'reorder' | 'bounce' => {
    if (!favorites.includes(dragId) || !favorites.includes(targetId) || dragId === targetId) {
      return 'bounce';
    }
    const next = reorder(favorites, dragId, targetId);
    setFavorites(next);
    persist(next, range);
    return 'reorder';
  };

  const favTargetAt = (x: number, y: number): string | null =>
    (document.elementFromPoint(x, y)?.closest('[data-fav-id]') as HTMLElement | null)
      ?.dataset.favId ?? null;

  const onFavPointerDown = (id: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = { id, startX: e.clientX, startY: e.clientY, active: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onFavPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
      d.active = true;
    }
    const target = favTargetAt(e.clientX, e.clientY);
    setDropHover(target && target !== d.id ? target : null);
  };
  const onFavPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setDropHover(null);
    if (!d?.active) return; // a plain tap — the click handler jumps to the panel
    justDragged.current = true;
    const target = favTargetAt(e.clientX, e.clientY);
    if (target) handleFavoriteDrop(d.id, target);
  };

  const jumpToPanel = (id: string) => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    document.getElementById(`iv-anchor-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // No readings at all: the honest nearly-empty page a new athlete starts
  // with (ADR 0004). Distinct from a range that merely windows everything out
  // — that keeps the range controls, so the athlete can widen it again.
  if (vm.datasetEmpty) {
    return (
      <p className="max-w-md text-center text-neutral-500" data-testid="info-empty">
        {t('empty')}
      </p>
    );
  }

  const railItem = (p: Panel, fav: boolean) => (
    <button
      key={p.id}
      data-fav-id={fav ? p.id : undefined}
      className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
        dropHover === p.id ? 'bg-neutral-200 dark:bg-neutral-700' : ''
      }`}
      onClick={() => jumpToPanel(p.id)}
      onPointerDown={fav ? onFavPointerDown(p.id) : undefined}
      onPointerMove={fav ? onFavPointerMove : undefined}
      onPointerUp={fav ? onFavPointerUp : undefined}
    >
      {t(p.titleKey)}
    </button>
  );

  return (
    <div className="w-full max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <CompareOverlayTrigger sessions={vm.windowed.sessions} />
        <span className="flex gap-1">
          {RANGE_KEYS.map((r) => (
            <button
              key={r}
              className={`rounded-full border px-3 py-1 text-xs ${
                range === r ? 'border-blue-500 text-blue-500' : 'text-neutral-500'
              }`}
              onClick={() => pickRange(r)}
            >
              {t(`range_${r}`)}
            </button>
          ))}
        </span>
        <span className="text-xs text-neutral-500">
          {t('readingCount', { n: vm.available.length, total: PANELS.length })}
        </span>
      </div>

      {vm.empty && (
        <p className="max-w-md text-neutral-500" data-testid="info-empty-range">
          {t('emptyRange')}
        </p>
      )}

      <div className="flex gap-6">
        <nav className="hidden w-44 shrink-0 sm:block">
          <div className="sticky top-4 flex flex-col gap-0.5">
            {vm.favPanels.length > 0 && (
              <div className="px-2 pt-2 text-xs font-semibold text-neutral-500">
                ★ {t('favorites')}
              </div>
            )}
            {vm.favPanels.map((p) => railItem(p, true))}
            {vm.groups.map((g) => (
              <div key={g.familyKey}>
                <div className="px-2 pt-2 text-xs font-semibold text-neutral-500">
                  {t(g.familyKey)}
                </div>
                {g.panels.map((p) => railItem(p, false))}
              </div>
            ))}
          </div>
        </nav>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
          <ComparisonGraph
            dataset={vm.windowed}
            graphIds={graphIds}
            onRemove={(id) => setGraphIds((g) => g.filter((x) => x !== id))}
            onClear={() => setGraphIds([])}
          />
          {vm.feed.map((p) => (
            <div
              key={p.id}
              id={`iv-anchor-${p.id}`}
              className={enlarged.includes(p.id) ? 'md:col-span-2' : ''}
            >
              <div className="rounded-lg border p-4" data-panel={p.id}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{t(p.titleKey)}</span>
                  <span className="flex gap-1">
                    {p.series && (
                      <button
                        className={`rounded px-1.5 text-sm ${
                          graphIds.includes(p.id) ? 'text-blue-500' : 'text-neutral-400'
                        }`}
                        title={t('addToGraph')}
                        aria-label={t('addToGraph')}
                        aria-pressed={graphIds.includes(p.id)}
                        onClick={() => setGraphIds((g) => toggleIn(g, p.id))}
                      >
                        ⇄
                      </button>
                    )}
                    <button
                      className={`rounded px-1.5 text-sm ${
                        enlarged.includes(p.id) ? 'text-blue-500' : 'text-neutral-400'
                      }`}
                      title={t('enlarge')}
                      aria-label={t('enlarge')}
                      aria-pressed={enlarged.includes(p.id)}
                      onClick={() => setEnlarged((g) => toggleIn(g, p.id))}
                    >
                      ⛶
                    </button>
                    <button
                      className={`rounded px-1.5 text-sm ${
                        isFavorite(favorites, p.id) ? 'text-amber-400' : 'text-neutral-400'
                      }`}
                      title={t(isFavorite(favorites, p.id) ? 'removeFavorite' : 'addFavorite')}
                      aria-label={t(isFavorite(favorites, p.id) ? 'removeFavorite' : 'addFavorite')}
                      aria-pressed={isFavorite(favorites, p.id)}
                      onClick={() => toggleFavorite(p.id)}
                    >
                      {isFavorite(favorites, p.id) ? '★' : '☆'}
                    </button>
                  </span>
                </div>
                <PanelBody id={p.id} dataset={vm.windowed} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Comparison Graph — one big chart collecting user-picked panels ───────────
function ComparisonGraph({
  dataset,
  graphIds,
  onRemove,
  onClear,
}: {
  dataset: InfoDataset;
  graphIds: string[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations('Information');
  const picked = graphIds
    .map((id) => PANELS.find((p) => p.id === id))
    .filter((p): p is Panel => Boolean(p?.series) && Boolean(p?.has(dataset)));
  if (!picked.length) return null;
  const entries = picked.flatMap((p) =>
    p.series!(dataset).map((s) => ({ panel: p, ...s })),
  );
  return (
    <div className="md:col-span-2">
      <div className="rounded-lg border p-4" data-panel="comparison-graph">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('graphTitle')}</span>
          <button className="text-xs text-neutral-500 underline" onClick={onClear}>
            {t('graphClear')}
          </button>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            >
              {t(p.titleKey)}
              <button
                title={t('graphRemove')}
                aria-label={t('graphRemove')}
                onClick={() => onRemove(p.id)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <ChartSvg w={600} h={200}>
          {entries.map((e, i) => (
            <Line key={i} vals={normalize(e.values)} w={600} h={200} color={e.color} />
          ))}
        </ChartSvg>
        <Legend items={entries.map((e) => [`${t(e.panel.titleKey)} — ${t(e.labelKey)}`, e.color])} />
        <div className="mt-2 text-xs text-neutral-500">{t('graphNote')}</div>
      </div>
    </div>
  );
}

// ── Session Comparison overlay ───────────────────────────────────────────────
function RpeChip({ value, color }: { value: number | null; color: string }) {
  if (value == null) return <>—</>;
  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs"
      style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {value}/10
    </span>
  );
}

function CompareOverlayTrigger({ sessions }: { sessions: InfoSession[] }) {
  const t = useTranslations('Information');
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<CompareFilter>({ sport: 'all', type: 'all' });

  const openPicker = () => {
    setOpen(true);
    setShow(false);
    setSelected([]);
  };

  if (!open) {
    return (
      <button className="rounded border px-3 py-1 text-sm" onClick={openPicker}>
        {t('compareOpen')}
      </button>
    );
  }

  const listed = filterSessions(sessions, filter);
  const all = filterSessions(sessions, {});
  const chosen = all.filter((s) => selected.includes(s.id));

  return (
    <>
      <button className="rounded border px-3 py-1 text-sm" onClick={openPicker}>
        {t('compareOpen')}
      </button>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg border bg-background p-4">
          {show && canCompare(selected) ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <b>{t('compareResultTitle')}</b>
                <span className="flex gap-2">
                  <button className="rounded border px-2 py-1 text-sm" onClick={() => setShow(false)}>
                    {t('compareBack')}
                  </button>
                  <button className="rounded border px-2 py-1 text-sm" onClick={() => setOpen(false)}>
                    {t('compareClose')}
                  </button>
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto">
                {extractColumns(chosen).map((c) => (
                  <div
                    key={c.id}
                    className="min-w-44 flex-1 rounded-md border p-3"
                    style={{ borderTop: `3px solid ${TYPE_COLORS[c.type] || 'var(--border)'}` }}
                  >
                    <div className="text-sm font-semibold">{c.title ?? c.type}</div>
                    <div className="mb-2 text-xs text-neutral-500">
                      {c.date} ·{' '}
                      <span style={{ color: SPORT_COLOR[c.sport ?? ''] || 'inherit' }}>
                        {t(SPORT_KEY[c.sport ?? ''] || 'other')}
                      </span>{' '}
                      · {c.type}
                    </div>
                    {c.rows.map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span className="text-neutral-500">{k === 'TSS' ? 'TSS' : t(k)}</span>
                        <b>{v}</b>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">{t('body')}</span>
                      <RpeChip value={c.body} color="#6db36d" />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">{t('mind')}</span>
                      <RpeChip value={c.mind} color="#9a7bd0" />
                    </div>
                    {c.comment && (
                      <div className="mt-2 text-xs italic text-neutral-500">“{c.comment}”</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-neutral-500">{t('compareNote')}</div>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <b>{t('compareTitle')}</b>
                <button className="rounded border px-2 py-1 text-sm" onClick={() => setOpen(false)}>
                  {t('compareClose')}
                </button>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <select
                  className="rounded border bg-background px-2 py-1"
                  value={filter.sport}
                  onChange={(e) => setFilter((f) => ({ ...f, sport: e.target.value }))}
                >
                  <option value="all">{t('allSports')}</option>
                  {['swim', 'bike', 'run'].map((s) => (
                    <option key={s} value={s}>
                      {t(SPORT_KEY[s])}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded border bg-background px-2 py-1"
                  value={filter.type}
                  onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
                >
                  <option value="all">{t('allTypes')}</option>
                  {FILTERABLE_TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {ty}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-neutral-500">{t('compareHint')}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-neutral-500">
                      <th />
                      <th className="py-1 font-normal">{t('colDate')}</th>
                      <th className="py-1 font-normal">{t('colSession')}</th>
                      <th className="py-1 font-normal">{t('colSport')}</th>
                      <th className="py-1 font-normal">{t('colType')}</th>
                      <th className="py-1 font-normal">Min</th>
                      <th className="py-1 font-normal">{t('body')}</th>
                      <th className="py-1 font-normal">{t('mind')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listed.slice(0, 40).map((s) => (
                      <tr key={s.id} className={selected.includes(s.id) ? 'bg-neutral-100 dark:bg-neutral-800' : ''}>
                        <td className="py-0.5">
                          <input
                            type="checkbox"
                            checked={selected.includes(s.id)}
                            onChange={(e) =>
                              setSelected((sel) =>
                                e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id),
                              )
                            }
                          />
                        </td>
                        <td className="py-0.5">{s.date}</td>
                        <td className="py-0.5">{s.title ?? s.type}</td>
                        <td className="py-0.5" style={{ color: SPORT_COLOR[s.sport ?? ''] || 'inherit' }}>
                          {t(SPORT_KEY[s.sport ?? ''] || 'other')}
                        </td>
                        <td className="py-0.5" style={{ color: TYPE_COLORS[s.type] || 'inherit' }}>
                          {s.type}
                        </td>
                        <td className="py-0.5">{s.durMin ?? '—'}</td>
                        <td className="py-0.5">{s.body ?? '—'}</td>
                        <td className="py-0.5">{s.mind ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <button
                  className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                  disabled={!canCompare(selected)}
                  onClick={() => canCompare(selected) && setShow(true)}
                >
                  {t('compareGo', { n: selected.length })}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
