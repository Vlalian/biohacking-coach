import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { filesMatchingRaw, SWEEP_TIMEOUT_MS } from '@/test/source-sweep';

/**
 * `training-architecture/08` — the Head Coach's block editor, first render.
 * `renderToStaticMarkup` like `calendar.test.tsx`: what is asserted is what is
 * in the markup, and what is not.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The server action's import chain reaches auth and the database; a first
// render never calls it.
vi.mock('./block-actions', () => ({ editBlockAction: vi.fn() }));

const { BlockPanel, afterSave } = await import('./block-panel');

const SET = {
  raceId: 'r1',
  raceName: 'Ironman Copenhagen',
  raceDate: '2027-03-14',
  version: 3,
  stale: false,
  startDate: '2026-09-14',
  blocks: [
    { name: 'Block 1 of 3', endDate: '2026-11-15', authoredBy: 'arithmetic' as const },
    { name: 'Sharpen the Bike', endDate: '2027-01-17', authoredBy: 'coach_ai' as const },
    { name: 'Long Rides', endDate: '2027-03-14', authoredBy: 'head_coach' as const },
  ],
};

describe('BlockPanel', () => {
  const html = renderToStaticMarkup(<BlockPanel athleteId="a1" set={SET} />);

  it('renders one editable row per block with its author label', () => {
    expect(html.match(/<li\b/g)).toHaveLength(3);
    expect(html).toContain('value="Block 1 of 3"');
    expect(html).toContain('value="Sharpen the Bike"');
    expect(html).toContain('value="Long Rides"');
    expect(html).toContain('authorDraft()');
    expect(html).toContain('authorCoach()');
    expect(html).toContain('authorYou()');
    expect(html).toContain('toward(race=Ironman Copenhagen,date=2027-03-14)');
  });

  it('disables the last block’s end-date input and says why; bounds the others by their neighbours', () => {
    const dates = [...html.matchAll(/<input type="date"[^>]*>/g)].map((m) => m[0]);
    expect(dates).toHaveLength(3);
    expect(dates[0]).toContain('min="2026-09-14"');
    expect(dates[0]).toContain('max="2027-01-16"');
    expect(dates[1]).toContain('min="2026-11-16"');
    expect(dates[1]).toContain('max="2027-03-13"');
    // The attribute, not the Tailwind variant class that is on every row.
    expect(dates[0]).not.toMatch(/\sdisabled=""/);
    expect(dates[1]).not.toMatch(/\sdisabled=""/);
    expect(dates[2]).toMatch(/\sdisabled=""/);
    expect(html).toContain('endsOnRaceDay()');
  });

  it('carries the set’s version, which every submit sends back', () => {
    expect(html).toContain('data-version="3"');
  });

  it('offers no add and no remove — rename and re-boundary only', () => {
    // One Save per row and nothing else clickable: the panel is the shape of
    // the authority (issue 08, "do not widen").
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).not.toMatch(/add|remove|delete/i);
  });

  it('goes read-only, with a word saying why, when the stored set no longer fits the race', () => {
    // A race that moved leaves the athlete on the arithmetic draft while the
    // stored rows are the old set; an edit here would land on blocks the coach
    // never saw (review of 08, 2026-09-15). Show the blocks, offer no edit.
    const stale = renderToStaticMarkup(<BlockPanel athleteId="a1" set={{ ...SET, stale: true }} />);
    expect(stale).toContain('stale()');
    expect(stale).not.toContain('<input');
    expect(stale).not.toContain('<button');
    expect(stale).toContain('Sharpen the Bike');
  });

  it('renders nothing for an athlete with no Target Race', () => {
    expect(renderToStaticMarkup(<BlockPanel athleteId="a1" set={null} />)).toBe('');
  });
});

describe('the block edit has exactly one production caller', () => {
  it('is block-actions.ts, and only block-actions.ts, outside the service itself', () => {
    // The athlete has no block write path at all: the strip is control-free,
    // and no athlete action touches `training_block_set`. This pins that a
    // second caller — an athlete action, a background job — cannot appear
    // without this test naming the file.
    const callers = filesMatchingRaw(/\beditBlockAsHeadCoach\b/, { includeTests: false });

    expect(callers).toEqual([
      'app/[locale]/(app)/coach/athlete/[athleteId]/block-actions.ts',
      'features/coach/training-block-service.ts',
    ]);
  }, SWEEP_TIMEOUT_MS);
});

describe('afterSave — what the panel believes once a save has landed', () => {
  // The panel keeps the set in state and `router.refresh()` does not reset
  // state, so the *second* save used to send the version of the first render
  // and be refused as a conflict the coach did not cause (review of 08).
  it('carries the new version and the edited row, authored by the coach', () => {
    const next = afterSave(SET, 2, { name: 'Bike Focus', endDate: '2027-01-24' }, 4);
    expect(next.version).toBe(4);
    expect(next.blocks[1]).toEqual({ name: 'Bike Focus', endDate: '2027-01-24', authoredBy: 'head_coach' });
    expect(next.blocks[0]).toEqual(SET.blocks[0]);
    expect(next.blocks[2]).toEqual(SET.blocks[2]);
  });

  it('two saves in a row each send the version the last save returned', () => {
    const first = afterSave(SET, 1, { name: 'Base', endDate: SET.blocks[0].endDate }, 4);
    const second = afterSave(first, 1, { name: 'Base Miles', endDate: SET.blocks[0].endDate }, 5);
    expect([SET.version, first.version, second.version]).toEqual([3, 4, 5]);
  });
});
