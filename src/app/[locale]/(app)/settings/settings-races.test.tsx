import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * `training-architecture/09` — the Races section of Settings.
 *
 * Rendered, not asserted on props: what the section *offers* is the contract —
 * one target badge, "make target" only where it means something, a remove on
 * every race, and an add form that asks for a distance of its own.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const { RacesSection } = await import('./settings-races');

const noop = async () => ({ ok: true }) as const;
const add = async () => ({ ok: true, raceId: 'r_new' }) as const;

const races = [
  { id: 'r1', name: 'Ironman Copenhagen', date: '2027-08-15', distance: 'Full', isTarget: true },
  { id: 'r2', name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic', isTarget: false },
];

function render(list = races) {
  return renderToStaticMarkup(
    <RacesSection races={list} onAdd={add} onSetTarget={noop} onRemove={noop} />,
  );
}

describe('RacesSection', () => {
  it('renders every race with its own distance', () => {
    const html = render();
    expect(html).toContain('Ironman Copenhagen');
    expect(html).toContain('Full');
    expect(html).toContain('Olympic Odense');
    expect(html).toContain('Olympic');
  });

  it('marks exactly one race as the target', () => {
    const html = render();
    expect(html.match(/racesTargetBadge/g)?.length).toBe(1);
  });

  it('offers "make target" only on the races that are not the target', () => {
    const html = render();
    expect(html.match(/racesMakeTarget/g)?.length).toBe(1);
    const three = [...races, { id: 'r3', name: 'Half Aarhus', date: '2027-05-01', distance: 'Half', isTarget: false }];
    expect(render(three).match(/racesMakeTarget/g)?.length).toBe(2);
  });

  it('offers remove on every race', () => {
    expect(render().match(/racesRemove/g)?.length).toBe(2);
  });

  it('asks for a distance when adding a race, offering the closed set', () => {
    const html = render();
    expect(html).toContain('racesAddLabel');
    for (const d of ['Sprint', 'Olympic', 'Half', 'Full']) expect(html).toContain(`value="${d}"`);
  });

  it('says plainly there are no races, without a target badge', () => {
    const html = render([]);
    expect(html).toContain('racesNone');
    expect(html).not.toContain('racesTargetBadge');
  });
});
