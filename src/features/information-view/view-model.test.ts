import { describe, it, expect } from 'vitest';
import { buildViewModel } from './view-model';
import { emptyDataset } from './dataset';
import { DEFAULT_FAVORITES } from './layout';
import { PANELS } from './panels';
import { syntheticDataset } from './synthetic-fixtures';

const TODAY = '2026-07-14';
const rich = syntheticDataset('rich', TODAY);
const fresh = syntheticDataset('fresh', TODAY);

describe('buildViewModel — the orchestrator math, ported from the POC', () => {
  it('default favorites are pinned first in the feed, stored order', () => {
    const vm = buildViewModel(rich, DEFAULT_FAVORITES, 'all');
    expect(vm.feed.slice(0, 4).map((p) => p.id)).toEqual(['ffnow', 'load', 'bodymind', 'sleep']);
  });

  it('feed order is favorites first, then family groups flattened — rail order equals feed order', () => {
    const vm = buildViewModel(rich, DEFAULT_FAVORITES, 'all');
    const railIds = [
      ...vm.favPanels.map((p) => p.id),
      ...vm.groups.flatMap((g) => g.panels.map((p) => p.id)),
    ];
    expect(vm.feed.map((p) => p.id)).toEqual(railIds);
  });

  it('rich data makes the full catalog available; groups follow catalog family order', () => {
    const vm = buildViewModel(rich, [], 'all');
    expect(vm.available).toHaveLength(PANELS.length);
    expect(vm.groups.map((g) => g.familyKey)).toEqual([
      'familyFormLoad',
      'familyBodyMind',
      'familyVolume',
      'familyPeaks',
    ]);
  });

  it('a family disappears entirely when none of its panels have a reading', () => {
    const vm = buildViewModel(fresh, DEFAULT_FAVORITES, 'all');
    expect(vm.groups.map((g) => g.familyKey)).not.toContain('familyPeaks');
  });

  it('a favorited panel without a reading is absent from display but the favorites list is untouched', () => {
    const favorites = [...DEFAULT_FAVORITES, 'peaks-power'];
    const vm = buildViewModel(fresh, favorites, 'all');
    expect(vm.favPanels.map((p) => p.id)).not.toContain('peaks-power');
    expect(favorites).toContain('peaks-power'); // the preference survives
  });

  it('demote never hides: with no favorites at all, every available panel is still in the feed', () => {
    const vm = buildViewModel(rich, [], 'all');
    expect(vm.favPanels).toHaveLength(0);
    expect(vm.feed.map((p) => p.id)).toEqual(vm.available.map((p) => p.id));
  });

  it('the range windows the dataset every panel then reads', () => {
    const vm = buildViewModel(rich, DEFAULT_FAVORITES, 'r4');
    expect(vm.windowed.weekly).toHaveLength(4);
    expect(vm.available.length).toBeGreaterThan(0);
  });

  it('an athlete with no data yet gets the empty state, not an error', () => {
    const vm = buildViewModel(emptyDataset(), DEFAULT_FAVORITES, 'all');
    expect(vm.empty).toBe(true);
    expect(vm.datasetEmpty).toBe(true);
    expect(vm.feed).toHaveLength(0);
    expect(vm.groups).toHaveLength(0);
  });

  it('a short range over old data empties the view but NOT the dataset — the range trap', () => {
    // Everything the athlete has is older than 4 weeks; a stored 'r4' range
    // must not strand them on a controls-free empty page.
    const D = emptyDataset();
    D.sessions.push({
      id: 's',
      date: '2026-05-01',
      week: 10,
      title: 'Old Run',
      sport: 'run',
      type: 'Endurance',
      durMin: 60,
      km: 10,
      tss: null,
      power: null,
      hr: null,
      kj: null,
      body: 5,
      mind: 5,
      comment: '',
      status: 'done',
    });
    const vm = buildViewModel(D, DEFAULT_FAVORITES, 'r4');
    expect(vm.empty).toBe(true);
    expect(vm.datasetEmpty).toBe(false);
  });
});
