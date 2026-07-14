// Information View — thin orchestrator.
//
// Renders the Panel Catalog × dataset into #information-view. Panels come
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

function panelCard(p, dataset) {
  return `<div class="iv-panel" data-panel="${p.id}">
    <div class="iv-phead">
      <span class="iv-ptitle">${t(p.titleKey)}</span>
    </div>
    <div class="iv-pbody">${p.render(dataset, { t })}</div>
  </div>`;
}

function bindOnce(view) {
  if (bound) return;
  bound = true;
  view.addEventListener('click', e => {
    const dk = e.target.closest('[data-datakind]');
    if (dk) setDataState(dk.dataset.datakind);
  });
}

export function renderInformation() {
  const view = document.getElementById('information-view');
  if (!view) return;
  const dataset = getDataset(dataState);
  const panels = availablePanels(dataset);
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
      <div class="iv-feed">
        ${panels.map(p => panelCard(p, dataset)).join('')}
      </div>
    </div>`;
  bindOnce(view);
}
