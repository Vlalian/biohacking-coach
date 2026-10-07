import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// The panel is a client component whose action reaches the database; no first
// render calls it. Keys come back as themselves, as in the drawer test.
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./prescribe-actions', () => ({ prescribeSessionAction: vi.fn() }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}(${Object.values(values).join(',')})` : key,
}));

const { PrescribePanel } = await import('./prescribe-panel');

/** `showable-version/52`: the Head Coach picks the sport of a session they add. */
describe('PrescribePanel — the sport picker', () => {
  it('offers the seven sports with none picked', () => {
    const html = renderToStaticMarkup(
      <PrescribePanel athleteId="ath_1" writer={{ begin: () => {}, settle: () => {} } as never} />,
    );
    const select = html.match(/<select[^>]*data-field="sport"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? '';
    const values = [...select.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => m[1]);

    expect(values).toEqual(['', 'swim', 'bike', 'run', 'brick', 'strength', 'mobility', 'misc']);
    expect(select).toMatch(/<option(?=[^>]*\bselected)[^>]*value=""/);
  });
});
