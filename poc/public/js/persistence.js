const LS = 'bca_';

const PERSIST_FIELDS = [
  { id: 'apiKey',       display: null },
  { id: 'body',         display: 'bodyVal' },
  { id: 'mental',       display: 'mentalVal' },
  { id: 'energy',       display: 'energyVal' },
  { id: 'sleep',        display: null },
  { id: 'pulse',        display: null },
  { id: 'phase',        display: null },
  { id: 'sessionCount', display: null },
];

// Returns the current active history scenario key from the UI, for callers to pass into save().
export function activeHistoryKey() {
  const active = document.querySelector('.history-scenarios .scenario.active');
  const m = active?.getAttribute('onclick')?.match(/loadHistory\('([^']+)'/);
  return m ? m[1] : 'none';
}

export function save(experienceLevel, historyKey) {
  PERSIST_FIELDS.forEach(f => {
    const el = document.getElementById(f.id);
    if (el) localStorage.setItem(LS + f.id, el.value);
  });
  localStorage.setItem(LS + 'experienceLevel', experienceLevel);
  localStorage.setItem(LS + 'commStyle', window._commStyle || '');
  localStorage.setItem(LS + 'historyKey', historyKey || 'none');
}

// Returns { experienceLevel, historyKey, commStyle } and mutates the DOM to match.
export function restore() {
  PERSIST_FIELDS.forEach(f => {
    const val = localStorage.getItem(LS + f.id);
    if (val === null) return;
    const el = document.getElementById(f.id);
    if (!el) return;
    el.value = val;
    if (f.display) document.getElementById(f.display).textContent = val;
  });

  const historyKey      = localStorage.getItem(LS + 'historyKey') || 'none';
  const experienceLevel = localStorage.getItem(LS + 'experienceLevel') || 'intermediate';
  const commStyle       = localStorage.getItem(LS + 'commStyle') || '';
  window._commStyle = commStyle;

  return { experienceLevel, historyKey, commStyle };
}
