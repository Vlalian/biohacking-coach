import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * `training-architecture/37` — the one race form, shared by Settings and a
 * calendar day's "+" (ruling 1). What it offers on first render is the
 * contract: name, date, distance, and Target or Tune-up; a date carried in
 * from the day; and, when a Target Race exists, a warning before a new one
 * replaces it.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}(${Object.values(values).join(',')})` : key,
}));

const { RaceForm } = await import('./race-form');

const onAdd = async () => true;

describe('RaceForm', () => {
  it('asks for name, date, distance, and Target or Tune-up', () => {
    const html = renderToStaticMarkup(<RaceForm currentTarget={null} onAdd={onAdd} disabled={false} />);
    expect(html).toContain('type="date"');
    for (const d of ['Sprint', 'Olympic', 'Half', 'Full']) expect(html).toContain(`value="${d}"`);
    expect(html).toMatch(/data-race-kind-choice="target"/);
    expect(html).toMatch(/data-race-kind-choice="tune-up"/);
  });

  it('the race form opened from a day carries that date', () => {
    const html = renderToStaticMarkup(
      <RaceForm defaultDate="2027-08-16" currentTarget={null} onAdd={onAdd} disabled={false} />,
    );
    expect(html).toMatch(/type="date"[^>]*value="2027-08-16"/);
  });

  it('starts as the Target Race when there is none, and as a tune-up beside one', () => {
    const none = renderToStaticMarkup(<RaceForm currentTarget={null} onAdd={onAdd} disabled={false} />);
    expect(none).toMatch(/data-race-kind-choice="target"[^>]*aria-pressed="true"/);
    const beside = renderToStaticMarkup(
      <RaceForm currentTarget={{ name: 'IM Kbh' }} onAdd={onAdd} disabled={false} />,
    );
    expect(beside).toMatch(/data-race-kind-choice="tune-up"[^>]*aria-pressed="true"/);
    // A tune-up replaces nothing, so nothing warns.
    expect(beside).not.toContain('racesReplacesTarget');
  });

  it('warns that a new target replaces the current one, and asks to confirm', () => {
    const html = renderToStaticMarkup(
      <RaceForm currentTarget={{ name: 'IM Kbh' }} defaultKind="target" onAdd={onAdd} disabled={false} />,
    );
    expect(html).toContain('racesReplacesTarget(IM Kbh)');
    expect(html).toMatch(/type="checkbox"[^>]*data-confirm-replace/);
  });

  it('a first Target Race asks nothing — there is nothing to replace', () => {
    const html = renderToStaticMarkup(<RaceForm currentTarget={null} onAdd={onAdd} disabled={false} />);
    expect(html).not.toContain('racesReplacesTarget');
    expect(html).not.toContain('data-confirm-replace');
  });
});
