// Information View — thin orchestrator.
//
// Renders the Panel Catalog × dataset × layout into #information-view as an
// index rail (★ Favorites first, then panel families) beside a single-column
// feed of large panels — the layout the prototype verdict picked (issue 09).
// Panels come from panels.js (pure), data from infodata.js (the synthetic
// seam), Favorites from infolayout.js, labels from translations.js. Keeps no
// domain logic of its own.

import { PANELS, availablePanels, svgOpen, line } from './panels.js';
import { getDataset, DATASET_STATES } from './infodata.js';
import { loadFavorites, saveFavorites, promote, demote, isFavorite, reorder } from './infolayout.js';
import { filterSessions, canCompare, extractColumns, normalize } from './infocompare.js';
import { t } from './translations.js';

const TYPE_COLOR  = { Endurance: '#4a90d9', Intensity: '#e05555', Tempo: '#c9a96e', Recovery: '#6db36d' };
const SPORT_COLOR = { swim: '#4fa3d9', bike: '#c9a96e', run: '#6db36d' };
const SPORT_KEY   = { swim: 'infoSwim', bike: 'infoBike', run: 'infoRun' };

let dataState = 'rich'; // POC dataset state, switched by the prototype banner
let bound = false;

export function currentDataState() { return dataState; }

// Exported for tests and the banner control — not an athlete-facing feature.
export function setDataState(state) {
  if (!DATASET_STATES.includes(state)) return;
  dataState = state;
  cmp.sel.clear(); // session ids are dataset-specific
  cmp.show = false;
  renderInformation();
}

// Exported click handler: scroll the feed to a panel's anchor.
export function jumpToPanel(id) {
  const el = document.getElementById(`iv-anchor-${id}`);
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return el;
}

// Comparison Graph — the set of panels whose series the athlete has added
// to the combined chart. A viewing mode: deliberately NOT persisted.
const graphSet = new Set();

// Enlarged panels — span the full row for closer analysis. Also a viewing
// mode, not persisted.
const enlarged = new Set();

// Exported click handler: ⇄ adds/removes a panel's series on the Comparison Graph.
export function toggleCompareGraph(id) {
  graphSet.has(id) ? graphSet.delete(id) : graphSet.add(id);
  renderInformation();
}

export function clearCompareGraph() {
  graphSet.clear();
  renderInformation();
}

// Exported click handler: ⛶ toggles a panel between normal and full-row size.
export function toggleEnlarge(id) {
  enlarged.has(id) ? enlarged.delete(id) : enlarged.add(id);
  renderInformation();
}

// Exported click handler: star = promote into Favorites, unstar = demote.
export function toggleFavorite(id) {
  const validIds = PANELS.map(p => p.id);
  const favs = loadFavorites(validIds);
  saveFavorites(isFavorite(favs, id) ? demote(favs, id) : promote(favs, id));
  renderInformation();
}

// ── Favorites drag-reorder — pointer-event drag (Session Move pattern) ───────
// Drag is scoped to the ★ group: both the dragged id and the target must be
// favorites, otherwise the drop bounces silently. The gesture is verified
// manually in the browser — tests invoke handleFavoriteDrop directly.

let drag = null;         // { id, el, startX, startY, active }
let justDragged = false; // suppresses the jump-click that follows a completed drag

// Applies a ★-group reorder and re-renders on success. Exported for tests.
export function handleFavoriteDrop(dragId, targetId) {
  const favs = loadFavorites(PANELS.map(p => p.id));
  if (!favs.includes(dragId) || !favs.includes(targetId) || dragId === targetId) return 'bounce';
  saveFavorites(reorder(favs, dragId, targetId));
  renderInformation();
  return 'reorder';
}

function favTargetAt(x, y) {
  return document.elementFromPoint(x, y)?.closest?.('.iv-railitem.fav') || null;
}

function clearDropHover() {
  document.querySelectorAll('.iv-railitem.drop-hover').forEach(el => el.classList.remove('drop-hover'));
}

function onFavPointerDown(e) {
  drag = { id: e.currentTarget.dataset.jump, el: e.currentTarget, startX: e.clientX, startY: e.clientY, active: false };
  e.currentTarget.setPointerCapture?.(e.pointerId);
}

function onFavPointerMove(e) {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    drag.active = true;
    drag.el.classList.add('dragging');
  }
  clearDropHover();
  const target = favTargetAt(e.clientX, e.clientY);
  if (target && target.dataset.jump !== drag.id) target.classList.add('drop-hover');
}

function onFavPointerUp(e) {
  if (!drag) return;
  const { id, el, active } = drag;
  drag = null;
  clearDropHover();
  el.classList.remove('dragging');
  if (!active) return; // a plain tap — the click handler jumps to the panel
  justDragged = true;
  const target = favTargetAt(e.clientX, e.clientY);
  if (target) handleFavoriteDrop(id, target.dataset.jump);
}

function bindRailDrag(view) {
  view.querySelectorAll('.iv-railitem.fav').forEach(item => {
    item.addEventListener('pointerdown', onFavPointerDown);
    item.addEventListener('pointermove', onFavPointerMove);
    item.addEventListener('pointerup', onFavPointerUp);
    item.addEventListener('pointercancel', () => { drag?.el.classList.remove('dragging'); drag = null; clearDropHover(); });
  });
}

// ── Session Comparison overlay ────────────────────────────────────────────────
const cmp = {
  open: false, show: false,
  sel: new Set(),
  filter: { sport: 'all', type: 'all' },
};

function rpeChip(v, color) {
  return v == null ? '—' : `<span class="iv-rpe" style="background:${color}22;color:${color};border:1px solid ${color}55">${v}/10</span>`;
}

function compareOverlay(dataset) {
  const done = filterSessions(dataset.sessions, cmp.filter);
  const all  = filterSessions(dataset.sessions, {});
  const sel  = all.filter(s => cmp.sel.has(s.id));

  if (cmp.show && canCompare([...cmp.sel])) {
    const cols = extractColumns(sel);
    return `<div class="iv-overlay"><div class="iv-sheet">
      <div class="iv-sheethead"><b>${t('infoCompareResultTitle')}</b>
        <span><button class="iv-btn" data-cmpback="1">${t('infoCompareBack')}</button>
        <button class="iv-btn" data-cmpclose="1">${t('infoCompareClose')}</button></span></div>
      <div class="iv-cmpcols">
        ${cols.map(c => `<div class="iv-cmpcol" style="border-top:3px solid ${TYPE_COLOR[c.type] || 'var(--border)'}">
          <div class="iv-cmptitle">${c.title}</div>
          <div class="iv-cmpdate">${c.date} · <span style="color:${SPORT_COLOR[c.sport] || 'inherit'}">${t(SPORT_KEY[c.sport] || c.sport)}</span> · ${c.type}</div>
          ${c.rows.map(([k, v]) => `<div class="iv-cmprow"><span>${k === 'TSS' ? 'TSS' : t(k)}</span><b>${v}</b></div>`).join('')}
          <div class="iv-cmprow"><span>${t('feedbackBodyShort')}</span><b>${rpeChip(c.body, '#6db36d')}</b></div>
          <div class="iv-cmprow"><span>${t('feedbackMindShort')}</span><b>${rpeChip(c.mind, '#9a7bd0')}</b></div>
          ${c.comment ? `<div class="iv-cmpcomment">“${c.comment}”</div>` : ''}
        </div>`).join('')}
      </div>
      <div class="iv-note" style="padding:0 18px 14px;">${t('infoCompareNote')}</div>
    </div></div>`;
  }

  const SPORTS = ['swim', 'bike', 'run'];
  return `<div class="iv-overlay"><div class="iv-sheet">
    <div class="iv-sheethead"><b>${t('infoCompareTitle')}</b><button class="iv-btn" data-cmpclose="1">${t('infoCompareClose')}</button></div>
    <div class="iv-cmpfilters">
      <select data-cmpf="sport"><option value="all">${t('infoAllSports')}</option>${SPORTS.map(s => `<option value="${s}" ${cmp.filter.sport === s ? 'selected' : ''}>${t(SPORT_KEY[s])}</option>`).join('')}</select>
      <select data-cmpf="type"><option value="all">${t('infoAllTypes')}</option>${Object.keys(TYPE_COLOR).map(ty => `<option value="${ty}" ${cmp.filter.type === ty ? 'selected' : ''}>${ty}</option>`).join('')}</select>
      <span class="iv-hint">${t('infoCompareHint')}</span>
    </div>
    <div class="iv-cmplist">
      <table class="iv-table iv-picker"><tr><th></th><th>${t('infoColDate')}</th><th>${t('infoColSession')}</th><th>${t('infoColSport')}</th><th>${t('infoColType')}</th><th>Min</th><th>TSS</th><th>${t('feedbackBodyShort')}</th><th>${t('feedbackMindShort')}</th></tr>
      ${done.slice(0, 40).map(s => `<tr class="${cmp.sel.has(s.id) ? 'iv-hl' : ''}">
        <td><input type="checkbox" data-cmpsel="${s.id}" ${cmp.sel.has(s.id) ? 'checked' : ''}></td>
        <td>${s.date}</td><td>${s.title}</td>
        <td style="color:${SPORT_COLOR[s.sport] || 'inherit'}">${t(SPORT_KEY[s.sport] || s.sport)}</td>
        <td style="color:${TYPE_COLOR[s.type] || 'inherit'}">${s.type}</td>
        <td>${s.durMin}</td><td>${s.tss}</td><td>${s.body ?? '—'}</td><td>${s.mind ?? '—'}</td></tr>`).join('')}
      </table>
    </div>
    <div class="iv-sheetfoot"><button class="iv-btn iv-btn-go" data-cmpgo="1" ${canCompare([...cmp.sel]) ? '' : 'disabled'}>${t('infoCompareGo').replace('{n}', cmp.sel.size)}</button></div>
  </div></div>`;
}

// Family groups in catalog order of first appearance, available panels only.
function familyGroups(panels) {
  const groups = [];
  for (const p of panels) {
    let g = groups.find(x => x.familyKey === p.familyKey);
    if (!g) { g = { familyKey: p.familyKey, panels: [] }; groups.push(g); }
    g.panels.push(p);
  }
  return groups;
}

function starBtn(id, fav) {
  const title = t(fav ? 'infoRemoveFavorite' : 'infoAddFavorite');
  return `<button class="iv-star ${fav ? 'on' : ''}" data-star="${id}" title="${title}" aria-label="${title}">${fav ? '★' : '☆'}</button>`;
}

function panelCard(p, dataset, fav) {
  const inGraph = graphSet.has(p.id);
  const big = enlarged.has(p.id);
  const cmpBtn = p.series
    ? `<button class="iv-cbtn ${inGraph ? 'on' : ''}" data-graphadd="${p.id}" title="${t('infoAddToGraph')}" aria-label="${t('infoAddToGraph')}">⇄</button>`
    : '';
  const bigBtn = `<button class="iv-cbtn ${big ? 'on' : ''}" data-enlarge="${p.id}" title="${t('infoEnlarge')}" aria-label="${t('infoEnlarge')}">⛶</button>`;
  return `<div class="iv-panel" data-panel="${p.id}">
    <div class="iv-phead">
      <span class="iv-ptitle">${t(p.titleKey)}</span>
      <span class="iv-pacts">${cmpBtn}${bigBtn}${starBtn(p.id, fav)}</span>
    </div>
    <div class="iv-pbody">${p.render(dataset, { t })}</div>
  </div>`;
}

// The rail is pure navigation: no stars, no favorite highlighting — the
// ★ group heading alone says where the favorites are. The `fav` class is
// functional only (scopes drag-reorder), never styled.
function railItem(p, fav = false) {
  return `<button class="iv-railitem ${fav ? 'fav' : ''}" data-jump="${p.id}"><span>${t(p.titleKey)}</span></button>`;
}

// ── Comparison Graph — one big chart collecting user-picked panels ───────────
function comparisonGraph(dataset) {
  const picked = [...graphSet].map(id => availablePanels(dataset).find(p => p.id === id)).filter(Boolean);
  if (!picked.length) return '';
  const entries = picked.flatMap(p =>
    p.series(dataset).map(s => ({ panel: p, ...s })));
  let svg = svgOpen(600, 200);
  for (const e of entries) svg += line(normalize(e.values), 600, 200, e.color);
  svg += '</svg>';
  return `<div class="iv-anchor iv-span2"><div class="iv-panel iv-graphpanel" data-panel="comparison-graph">
    <div class="iv-phead">
      <span class="iv-ptitle">${t('infoGraphTitle')}</span>
      <button class="iv-btn" data-graphclear="1">${t('infoGraphClear')}</button>
    </div>
    <div class="iv-graphchips">
      ${picked.map(p => `<span class="iv-chiptag">${t(p.titleKey)}<button data-graphremove="${p.id}" title="${t('infoGraphRemove')}" aria-label="${t('infoGraphRemove')}">✕</button></span>`).join('')}
    </div>
    <div class="iv-pbody">${svg}
      ${legendFor(entries)}
      <div class="iv-note">${t('infoGraphNote')}</div>
    </div>
  </div></div>`;
}

function legendFor(entries) {
  return `<div class="iv-legend">${entries.map(e =>
    `<span><i style="background:${e.color}"></i>${t(e.panel.titleKey)} — ${t(e.labelKey)}</span>`).join('')}</div>`;
}

function bindOnce(view) {
  if (bound) return;
  bound = true;
  view.addEventListener('click', e => {
    const star = e.target.closest('[data-star]');
    if (star) { toggleFavorite(star.dataset.star); return; }
    const gadd = e.target.closest('[data-graphadd]');
    if (gadd) { toggleCompareGraph(gadd.dataset.graphadd); return; }
    const grem = e.target.closest('[data-graphremove]');
    if (grem) { toggleCompareGraph(grem.dataset.graphremove); return; }
    if (e.target.closest('[data-graphclear]')) { clearCompareGraph(); return; }
    const big = e.target.closest('[data-enlarge]');
    if (big) { toggleEnlarge(big.dataset.enlarge); return; }
    const dk = e.target.closest('[data-datakind]');
    if (dk) { setDataState(dk.dataset.datakind); return; }
    if (e.target.closest('[data-cmpopen]'))  { cmp.open = true;  cmp.show = false; cmp.sel.clear(); renderInformation(); return; }
    if (e.target.closest('[data-cmpclose]')) { cmp.open = false; renderInformation(); return; }
    if (e.target.closest('[data-cmpgo]'))    { if (canCompare([...cmp.sel])) { cmp.show = true; renderInformation(); } return; }
    if (e.target.closest('[data-cmpback]'))  { cmp.show = false; renderInformation(); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      if (justDragged) { justDragged = false; return; }
      jumpToPanel(jump.dataset.jump);
    }
  });
  view.addEventListener('change', e => {
    const selBox = e.target.closest('[data-cmpsel]');
    if (selBox) {
      selBox.checked ? cmp.sel.add(selBox.dataset.cmpsel) : cmp.sel.delete(selBox.dataset.cmpsel);
      renderInformation();
      return;
    }
    const filt = e.target.closest('[data-cmpf]');
    if (filt) { cmp.filter[filt.dataset.cmpf] = filt.value; renderInformation(); }
  });
}

export function renderInformation() {
  const view = document.getElementById('information-view');
  if (!view) return;
  const dataset = getDataset(dataState);
  const available = availablePanels(dataset);
  const storedFavs = loadFavorites(PANELS.map(p => p.id));

  // The layout is a preference; what renders is gated by data availability.
  const favPanels = storedFavs
    .map(id => available.find(p => p.id === id))
    .filter(Boolean);
  const restPanels = available.filter(p => !storedFavs.includes(p.id));
  const groups = familyGroups(restPanels);
  const feed = [...favPanels, ...restPanels];

  view.innerHTML = `
    <div class="iv-container">
      <div class="header">
        <h1>${t('navInformation')}</h1>
        <p>${t('infoSubtitle')}</p>
      </div>
      <div class="iv-databanner">
        <span>${t('infoDataBanner')}</span>
        <span class="iv-databtns">
          <button class="iv-databtn ${dataState === 'fresh' ? 'on' : ''}" data-datakind="fresh">${t('infoStateFresh')}</button>
          <button class="iv-databtn ${dataState === 'rich' ? 'on' : ''}" data-datakind="rich">${t('infoStateRich')}</button>
        </span>
      </div>
      <div class="iv-topbar">
        <button class="iv-btn" data-cmpopen="1">${t('infoCompareOpen')}</button>
        <span class="iv-hint">${t('infoReadingCount').replace('{n}', available.length).replace('{total}', PANELS.length)}</span>
      </div>
      <div class="iv-railwrap">
        <div class="iv-rail">
          ${favPanels.length ? `<div class="iv-railgroup iv-railgroup-fav" data-family="favorites">★ ${t('infoFavorites')}</div>` +
            favPanels.map(p => railItem(p, true)).join('') : ''}
          ${groups.map(g =>
            `<div class="iv-railgroup" data-family="${g.familyKey}">${t(g.familyKey)}</div>` +
            g.panels.map(p => railItem(p)).join('')
          ).join('')}
        </div>
        <div class="iv-feed">
          ${comparisonGraph(dataset)}
          ${feed.map(p => `<div id="iv-anchor-${p.id}" class="iv-anchor ${enlarged.has(p.id) ? 'iv-span2' : ''}">${panelCard(p, dataset, storedFavs.includes(p.id))}</div>`).join('')}
        </div>
      </div>
    </div>
    ${cmp.open ? compareOverlay(dataset) : ''}`;
  bindOnce(view);
  bindRailDrag(view);
}
