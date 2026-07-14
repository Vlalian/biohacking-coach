// Information View — thin orchestrator.
//
// Renders the Panel Catalog × dataset into #information-view. Panels come
// from panels.js (pure), data from infodata.js (the synthetic seam), labels
// from translations.js. Keeps no domain logic of its own.

import { availablePanels } from './panels.js';
import { getDataset } from './infodata.js';
import { t } from './translations.js';

let dataState = 'rich'; // POC dataset state; a banner control switches it (issue 02)

export function currentDataState() { return dataState; }

function panelCard(p, dataset) {
  return `<div class="iv-panel" data-panel="${p.id}">
    <div class="iv-phead">
      <span class="iv-ptitle">${t(p.titleKey)}</span>
    </div>
    <div class="iv-pbody">${p.render(dataset, { t })}</div>
  </div>`;
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
      <div class="iv-feed">
        ${panels.map(p => panelCard(p, dataset)).join('')}
      </div>
    </div>`;
}
