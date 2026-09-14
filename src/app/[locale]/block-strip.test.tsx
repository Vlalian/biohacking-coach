import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveBlocks, trainingBlocks } from '@/features/coach/training-blocks';

/**
 * `training-architecture/07` — the athlete's one-line read of their Training
 * Blocks. `renderToStaticMarkup`, like `calendar.test.tsx`: this is the first
 * render of pure presentational markup, and what is asserted is what is (and
 * is not) in it.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));

const { BlockStrip } = await import('./block-strip');

const TODAY = '2026-10-01';
const RACE = { name: 'Ironman Copenhagen', date: '2027-03-14' };
const shaped = resolveBlocks(TODAY, RACE, {
  startDate: '2026-09-14',
  blocks: [
    { name: 'Build the Volume', endDate: '2026-11-15', authoredBy: 'coach_ai' },
    { name: 'Sharpen the Bike', endDate: '2027-01-17', authoredBy: 'coach_ai' },
    { name: 'Taper', endDate: RACE.date, authoredBy: 'coach_ai' },
  ],
});

describe('BlockStrip', () => {
  it('renders the current block, the week inside it, and the weeks to the race', () => {
    const html = renderToStaticMarkup(<BlockStrip todayKey={TODAY} race={RACE} blocks={shaped} />);

    expect(html).toContain('Build the Volume');
    expect(html).toContain('weekOf(week=3,weeks=9)');
    expect(html).toContain('weeksToRace(weeks=23,race=Ironman Copenhagen)');
  });

  it('renders the arithmetic draft the same way when nothing was shaped', () => {
    const html = renderToStaticMarkup(
      <BlockStrip todayKey={TODAY} race={RACE} blocks={trainingBlocks(TODAY, RACE.date)} />,
    );
    expect(html).toContain('Block 1 of 4');
  });

  it('renders nothing with no race, no blocks, or a day outside every block', () => {
    expect(renderToStaticMarkup(<BlockStrip todayKey={TODAY} race={null} blocks={[]} />)).toBe('');
    expect(renderToStaticMarkup(<BlockStrip todayKey={TODAY} race={RACE} blocks={[]} />)).toBe('');
    expect(renderToStaticMarkup(<BlockStrip todayKey="2028-01-01" race={RACE} blocks={shaped} />)).toBe('');
  });

  it('is read-only: no button, input, select, textarea or form in the markup', () => {
    // The athlete can see the structure and touch none of it (issue 07, and the
    // criterion 08 pins again). Asserted on the static markup so a control
    // cannot be added without this going red.
    const html = renderToStaticMarkup(<BlockStrip todayKey={TODAY} race={RACE} blocks={shaped} />);
    expect(html).not.toMatch(/<(button|input|select|textarea|form)\b/i);
  });
});
