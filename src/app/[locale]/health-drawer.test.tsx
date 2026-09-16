import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HealthSpan } from '@/features/health/health-layer';

/**
 * `training-architecture/06` — the drawer where an athlete says what their body
 * can do, and where both they and their Head Coach read and add to the detail
 * thread.
 *
 * Rendered, not asserted on props: what each role is *offered* is the contract.
 * The athlete declares, closes and rates; the Head Coach sees everything the
 * athlete sees (Mads, 2026-09-11) and may only add a note.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(',')})` : key,
  useLocale: () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/use-dialog-focus', () => ({ useDialogFocus: () => ({ current: null }) }));
// Server actions: their import chain reaches auth and the database. None is
// called by a first render.
vi.mock('./health-actions', () => ({
  declareInjuryAction: vi.fn(),
  declareIllnessAction: vi.fn(),
  closeInjuryAction: vi.fn(),
  closeIllnessAction: vi.fn(),
  addHealthNoteAction: vi.fn(),
  setBotherAction: vi.fn(),
  readHealthNotesAction: vi.fn(async () => ({ ok: true, notes: [] })),
}));
vi.mock('./(app)/coach/athlete/[athleteId]/health-actions', () => ({
  addHealthNoteAsCoachAction: vi.fn(),
  readHealthNotesAsCoachAction: vi.fn(async () => ({ ok: true, notes: [] })),
}));

const { HealthDrawer } = await import('./health-drawer');

const openInjury: HealthSpan = {
  kind: 'injury', id: 'inj_1', from: '2026-09-02', to: null,
  capacity: { swim: 'full', bike: 'easy', run: 'none' }, bother: 3,
};
const openIllness: HealthSpan = { kind: 'illness', id: 'ill_1', from: '2026-09-08', to: null, bother: null };
const closedInjury: HealthSpan = {
  kind: 'injury', id: 'inj_0', from: '2026-06-01', to: '2026-06-20',
  capacity: { swim: 'none', bike: 'full', run: 'full' }, bother: 2,
};

function render(props: Partial<Parameters<typeof HealthDrawer>[0]> = {}) {
  return renderToStaticMarkup(
    <HealthDrawer
      state={{ open: true }}
      spans={[openInjury, openIllness, closedInjury]}
      locale="en"
      onClose={() => {}}
      {...props}
    />,
  );
}

describe('HealthDrawer — the athlete', () => {
  it('offers the declare form under the decided heading, never "report an injury"', () => {
    const html = render();
    expect(html).toContain('whatCanYouDo');
    expect(html.toLowerCase()).not.toContain('report');
    // Three disciplines, each with the three allowances as the athlete reads them.
    for (const d of ['swim', 'bike', 'run']) expect(html).toContain(`data-discipline="${d}"`);
    for (const a of ['allowFull', 'allowEasy', 'allowNone']) expect(html).toContain(a);
    // Illness is one button.
    expect(html).toContain('imIll');
  });

  it('offers close and the Bother Rating on each open record, and add-note', () => {
    const html = render();
    expect(html).toContain('imBack');
    expect(html).toContain('illnessOver');
    expect(html).toContain('botherQuestion');
    expect(html.match(/data-bother="/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain('notesDivider');
    expect(html).toContain('addNote');
  });

  it('shows what an open injury prevents in the athlete’s language, and the illness as its own record', () => {
    const html = render();
    expect(html).toContain('glance_none_run');
    expect(html).toContain('glance_easy_bike');
    expect(html).not.toContain('glance_full');
    expect(html).toContain('illnessLabel');
  });

  it('keeps closed records in a collapsed history, not among the open ones', () => {
    const html = render();
    expect(html).toContain('history');
    expect(html).toMatch(/<details[^>]*>[\s\S]*inj_0/);
    expect(html.match(/imBack/g)?.length).toBe(1);
  });

  it('treats a record closed today as closed — no close button, no rating on it', () => {
    const closedToday: HealthSpan = { ...closedInjury, id: 'inj_today', to: '2026-09-11' };
    const html = render({ spans: [openInjury, closedToday] });
    expect(html).toMatch(/<details[^>]*>[\s\S]*inj_today/);
    expect(html.match(/imBack/g)?.length).toBe(1);
  });

  it('opens straight onto the record that was clicked', () => {
    const html = render({ state: { open: true, kind: 'injury', id: 'inj_1' } });
    expect(html).toContain('data-selected="inj_1"');
  });

  it('renders nothing when closed', () => {
    expect(render({ state: { open: false } })).toBe('');
  });
});

describe('HealthDrawer — the Head Coach', () => {
  const coach = () => render({ coachAthleteId: 'a1' });

  it('sees everything the athlete sees — capacity, bother, thread, history', () => {
    const html = coach();
    expect(html).toContain('glance_none_run');
    expect(html).toContain('botherLabel(3)');
    expect(html).toContain('history');
    expect(html).toContain('notesDivider');
  });

  it('may add a note and nothing else — no declare, no close, no rating control', () => {
    const html = coach();
    expect(html).toContain('addNote');
    expect(html).not.toContain('whatCanYouDo');
    expect(html).not.toContain('imIll');
    expect(html).not.toContain('imBack');
    expect(html).not.toContain('illnessOver');
    expect(html).not.toContain('data-bother="');
  });
});
