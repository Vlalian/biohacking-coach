// Information View — thin orchestrator.
//
// Renders the Panel Catalog × dataset × layout into #information-view as an
// index rail (★ Favorites first, then panel families) beside a single-column
// feed of large panels — the layout the prototype verdict picked (issue 09).
// Panels come from panels.js (pure), data from infodata.js (the synthetic
// seam), Favorites from infolayout.js, labels from translations.js. Keeps no
// domain logic of its own.

import { PANELS, availablePanels } from './panels.js';
import { getDataset, DATASET_STATES } from './infodata.js';
import { loadFavorites, saveFavorites, promote, demote, isFavorite, reorder } from './infolayout.js';
import { t } from './translations.js';

let dataState = 'rich'; // POC dataset state, switched by the prototype banner
let bound = false;

export function currentDataState() { return dataState; }

// Exported for tests and the banner control — not an athlete-facing feature.
export function setDataState(state) {
  if (!DATASET_STATES.includes(state)) return;
  dataState = state;
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
  return `<div class="iv-panel" data-panel="${p.id}">
    <div class="iv-phead">
      <span class="iv-ptitle">${t(p.titleKey)}</span>
      <span class="iv-pacts">${starBtn(p.id, fav)}</span>
    </div>
    <div class="iv-pbody">${p.render(dataset, { t })}</div>
  </div>`;
}

function railItem(p, fav) {
  return `<button class="iv-railitem ${fav ? 'fav' : ''}" data-jump="${p.id}">
    <span>${t(p.titleKey)}</span>${starBtn(p.id, fav)}</button>`;
}

function bindOnce(view) {
  if (bound) return;
  bound = true;
  view.addEventListener('click', e => {
    const star = e.target.closest('[data-star]');
    if (star) { toggleFavorite(star.dataset.star); return; }
    const dk = e.target.closest('[data-datakind]');
    if (dk) { setDataState(dk.dataset.datakind); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      if (justDragged) { justDragged = false; return; }
      jumpToPanel(jump.dataset.jump);
    }
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
        <span class="iv-hint">${t('infoReadingCount').replace('{n}', available.length).replace('{total}', PANELS.length)}</span>
      </div>
      <div class="iv-railwrap">
        <div class="iv-rail">
          ${favPanels.length ? `<div class="iv-railgroup iv-railgroup-fav" data-family="favorites">★ ${t('infoFavorites')}</div>` +
            favPanels.map(p => railItem(p, true)).join('') : ''}
          ${groups.map(g =>
            `<div class="iv-railgroup" data-family="${g.familyKey}">${t(g.familyKey)}</div>` +
            g.panels.map(p => railItem(p, false)).join('')
          ).join('')}
        </div>
        <div class="iv-feed">
          ${feed.map(p => `<div id="iv-anchor-${p.id}">${panelCard(p, dataset, storedFavs.includes(p.id))}</div>`).join('')}
        </div>
      </div>
    </div>`;
  bindOnce(view);
  bindRailDrag(view);
}
