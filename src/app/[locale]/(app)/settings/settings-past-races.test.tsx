import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * `training-architecture/35` — the finished races in Settings, editable next
 * to the Races list: every entry with its four fields, a remove on each, and
 * an add form that asks for distance, date, finish and note.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const { PastRacesSection } = await import('./settings-past-races');

const noop = async () => ({ ok: true }) as const;
const add = async () => ({ ok: true, pastRaceId: 'pr_new' }) as const;

const list = [
  { id: 'pr1', distance: 'Half', date: '2025-08-16', finishSeconds: 18720, note: 'hot day' },
  { id: 'pr2', distance: 'Olympic', date: '2024-06-01', finishSeconds: null, note: null },
];

function render(rows = list) {
  return renderToStaticMarkup(<PastRacesSection pastRaces={rows} onAdd={add} onRemove={noop} />);
}

describe('PastRacesSection', () => {
  it('lists every finished race with distance, date, finish as h:mm and the note, oldest first', () => {
    const html = render();
    expect(html.indexOf('2024-06-01')).toBeLessThan(html.indexOf('2025-08-16'));
    expect(html).toContain('5:12');
    expect(html).toContain('hot day');
    expect(html.match(/data-past-race="/g)).toHaveLength(2);
    expect(html.match(/pastRacesRemove/g)).toHaveLength(2);
  });

  it('says so when there are none, and always offers the add form', () => {
    const html = render([]);
    expect(html).toContain('pastRacesNone');
    expect(html).toContain('data-action="add-past-race"');
    for (const d of ['Sprint', 'Olympic', 'Half', 'Full']) expect(html).toContain(`value="${d}"`);
    expect(html).toContain('type="date"');
  });
});
