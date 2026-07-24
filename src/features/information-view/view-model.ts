import { windowDataset, type InfoDataset } from './dataset';
import { RANGES, type RangeKey } from './layout';
import { availablePanels, type Panel } from './panels';

/**
 * The Information View's layout math, pure — what the POC's orchestrator did
 * between storage and DOM. The React component renders exactly this; the
 * behaviour (favorites pinned first, feed order = rail order, a favorited
 * panel with no reading absent from display but kept in the stored layout,
 * demote never hides) is tested here in node, not through a browser.
 */

export type FamilyGroup = { familyKey: string; panels: Panel[] };

export type InformationViewModel = {
  /** The dataset clipped to the athlete's chosen range. */
  windowed: InfoDataset;
  /** Panels with at least one reading, catalog order. */
  available: Panel[];
  /** Stored favorites that have a reading, stored order — pinned first. */
  favPanels: Panel[];
  /** Non-favorite available panels grouped by family, catalog order. */
  groups: FamilyGroup[];
  /** Feed order: favorites first, then the family groups flattened. */
  feed: Panel[];
  /** True when the chosen range holds no readings — offer a wider range. */
  empty: boolean;
  /**
   * True when the athlete has no readings at all, regardless of range — the
   * genuinely-new-athlete empty state. Distinct from `empty` so a stored short
   * range over old data never traps the athlete on a page with no controls.
   */
  datasetEmpty: boolean;
};

/** Family groups in catalog order of first appearance, available panels only. */
function familyGroups(panels: Panel[]): FamilyGroup[] {
  const groups: FamilyGroup[] = [];
  for (const p of panels) {
    let g = groups.find((x) => x.familyKey === p.familyKey);
    if (!g) {
      g = { familyKey: p.familyKey, panels: [] };
      groups.push(g);
    }
    g.panels.push(p);
  }
  return groups;
}

export function buildViewModel(
  dataset: InfoDataset,
  favorites: string[],
  range: RangeKey,
): InformationViewModel {
  const windowed = windowDataset(dataset, RANGES[range]);
  const available = availablePanels(windowed);

  // The layout is a preference; what renders is gated by data availability.
  const favPanels = favorites
    .map((id) => available.find((p) => p.id === id))
    .filter((p): p is Panel => Boolean(p));
  const restPanels = available.filter((p) => !favorites.includes(p.id));
  const groups = familyGroups(restPanels);

  return {
    windowed,
    available,
    favPanels,
    groups,
    feed: [...favPanels, ...restPanels],
    empty: available.length === 0,
    datasetEmpty: availablePanels(dataset).length === 0,
  };
}
