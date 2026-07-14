// Information View — thin orchestrator.
//
// Renders the Panel Catalog × dataset into #information-view as an index
// rail (grouped by panel family) beside a single-column feed of large
// panels — the layout the prototype verdict picked (issue 09). Panels come
// from panels.js (pure), data from infodata.js (the synthetic seam), labels
// from translations.js. Keeps no domain logic of its own.

import { PANELS, availablePanels } from './panels.js';
import { getDataset, DATASET_STATES } from './infodata.js';
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

function panelCard(p, dataset) {
  return `<div class="iv-panel" data-panel="${p.id}">
    <div class="iv-phead">
      <span class="iv-ptitle">${t(p.titleKey)}</span>
    </div>
    <div class="iv-pbody">${p.render(dataset, { t })}</div>
  </div>`;
}

function railItem(p) {
  return `<button class="iv-railitem" data-jump="${p.id}"><span>${t(p.titleKey)}</span></button>`;
}

function bindOnce(view) {
  if (bound) return;
  bound = true;
  view.addEventListener('click', e => {
    const dk = e.target.closest('[data-datakind]');
    if (dk) { setDataState(dk.dataset.datakind); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) jumpToPanel(jump.dataset.jump);
  });
}

export function renderInformation() {
  const view = document.getElementById('information-view');
  if (!view) return;
  const dataset = getDataset(dataState);
  const panels = availablePanels(dataset);
  const groups = familyGroups(panels);
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
        <span class="iv-hint">${t('infoReadingCount').replace('{n}', panels.length).replace('{total}', PANELS.length)}</span>
      </div>
      <div class="iv-railwrap">
        <div class="iv-rail">
          ${groups.map(g =>
            `<div class="iv-railgroup" data-family="${g.familyKey}">${t(g.familyKey)}</div>` +
            g.panels.map(railItem).join('')
          ).join('')}
        </div>
        <div class="iv-feed">
          ${panels.map(p => `<div id="iv-anchor-${p.id}">${panelCard(p, dataset)}</div>`).join('')}
        </div>
      </div>
    </div>`;
  bindOnce(view);
}
