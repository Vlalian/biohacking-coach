import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HealthSpan } from '@/features/health/health-layer';
import en from '@/messages/en.json';
import da from '@/messages/da.json';

/**
 * `training-architecture/06` — the drawer where an athlete says what their body
 * can do, and where both they and their Head Coach read and add to the detail
 * thread.
 *
 * Rendered, not asserted on props: what each role is *offered* is the contract.
 * The athlete reports, ends and rates; the Head Coach sees everything the
 * athlete sees (Mads, 2026-09-11) and may only add a note.
 *
 * `showable-version/50` (Mads, 2026-09-29) replaced the open list and its
 * History fold with two counted sections, Ongoing and Past, and the always-open
 * declare form with two entry points; the design is Lovable's (2026-11-01).
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
  deleteInjuryAction: vi.fn(),
  deleteIllnessAction: vi.fn(),
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
  name: 'left knee', openedAt: new Date('2026-09-02T08:00:00Z'),
};
const openIllness: HealthSpan = {
  kind: 'illness', id: 'ill_1', from: '2026-09-08', to: null, bother: null,
  name: null, openedAt: new Date('2026-09-08T08:00:00Z'),
};
const closedInjury: HealthSpan = {
  kind: 'injury', id: 'inj_0', from: '2026-06-01', to: '2026-06-20',
  capacity: { swim: 'none', bike: 'full', run: 'full' }, bother: 2,
  name: null, openedAt: new Date('2026-06-01T08:00:00Z'),
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

const sevenClosed: HealthSpan[] = Array.from({ length: 7 }, (_, i) => ({
  ...closedInjury,
  id: `inj_past_${i}`,
  from: `2026-0${i + 1}-01`,
  to: `2026-0${i + 1}-10`,
}));

describe('HealthDrawer — the athlete', () => {
  it('offers the two entry points, closed, and no form until one is chosen', () => {
    const html = render();
    expect(html).toMatch(/aria-expanded="false"[^>]*>[\s\S]*?reportInjury/);
    expect(html).toContain('>ill<');
    expect(html).not.toContain('data-field="name"');
  });

  it('lists one ongoing and seven past records under counted sections, with no fold (showable-version/50)', () => {
    const html = render({ spans: [openInjury, ...sevenClosed] });
    expect(html).toMatch(/ongoing[^<]*<span[^>]*>\(1\)/);
    expect(html).toMatch(/past[^<]*<span[^>]*>\(7\)/);
    expect(html).not.toContain('<details');
    expect(html.match(/data-record=/g)).toHaveLength(8);
  });

  it('shows a new athlete one sentence and both ways to report, no section headers', () => {
    const html = render({ spans: [] });
    expect(html).toContain('>empty<');
    expect(html).toContain('reportInjury');
    expect(html).toContain('>ill<');
    expect(html).not.toMatch(/>ongoing|>past/);
  });

  it('shows Ongoing (0) and Past (1) when the only record has ended', () => {
    const html = render({ spans: [closedInjury] });
    expect(html).toMatch(/ongoing[^<]*<span[^>]*>\(0\)/);
    expect(html).toMatch(/past[^<]*<span[^>]*>\(1\)/);
  });

  it('opens straight onto a past record a calendar mark named', () => {
    const html = render({ spans: [openInjury, closedInjury], state: { open: true, kind: 'injury', id: 'inj_0' } });
    expect(html).toContain('data-selected="inj_0"');
  });

  it('opens straight onto the record that was clicked, and its notes', () => {
    const html = render({ state: { open: true, kind: 'injury', id: 'inj_1' } });
    expect(html).toMatch(/data-record="inj_1"[^>]*data-selected="inj_1"[\s\S]*?notesDivider/);
  });

  it('opened with a kind and no id, selects the newest ongoing record of that kind', () => {
    const newer = { ...openInjury, id: 'inj_2', openedAt: new Date('2026-09-10T08:00:00Z') };
    expect(render({ spans: [openInjury, newer], state: { open: true, kind: 'injury' } })).toContain('data-selected="inj_2"');
    expect(render({ spans: [openInjury, openIllness], state: { open: true, kind: 'illness' } })).toContain('data-selected="ill_1"');
  });

  it('offers ending and the Bother Rating on each ongoing record, not on a past one', () => {
    const html = render({ spans: [openInjury, openIllness, closedInjury] });
    expect(html.match(/injuryOver/g)).toHaveLength(1);
    expect(html.match(/illnessOver/g)).toHaveLength(1);
    expect(html.match(/data-bother="/g)).toHaveLength(10);
  });

  it('treats a record ended today as past: no end button, no rating on it', () => {
    const endedToday = { ...openInjury, id: 'inj_today', to: '2026-09-14' };
    const html = render({ spans: [endedToday] });
    expect(html).toMatch(/past[^<]*<span[^>]*>\(1\)/);
    expect(html).not.toContain('injuryOver');
    expect(html).not.toContain('data-bother="');
  });

  it('shows what an injury prevents in the athlete’s language, and an illness as its own record', () => {
    const html = render();
    expect(html).toContain('glance_none_run');
    expect(html).toContain('glance_easy_bike');
    expect(html).not.toContain('glance_full');
    expect(html).toContain('illnessLabel');
  });

  it('offers Delete on an ongoing record and Remove from history on a past one, each asking nothing yet (showable-version/28e)', () => {
    const html = render({ spans: [openInjury, closedInjury] });
    expect(html).toMatch(/data-action="delete"[^>]*>declaredByMistake</);
    expect(html).toMatch(/data-action="remove"[^>]*>removeFromHistory</);
    expect(html).not.toContain('data-action="confirm-remove"');
    expect(html).not.toContain('tooOld');
  });

  it('renders nothing when closed', () => {
    expect(render({ state: { open: false } })).toBe('');
  });
});

describe('HealthDrawer — the Head Coach', () => {
  const coach = (props: Partial<Parameters<typeof HealthDrawer>[0]> = {}) =>
    render({ coachAthleteId: 'a1', athleteName: 'Sam', ...props });

  it('names the athlete in the title and sees what the athlete sees: capacity, bother, both sections', () => {
    const html = coach();
    expect(html).toContain('titleFor(Sam)');
    expect(html).toContain('glance_none_run');
    expect(html).toContain('botherLabel(3)');
    expect(html).toMatch(/ongoing[^<]*<span[^>]*>\(2\)/);
    expect(html).toMatch(/past[^<]*<span[^>]*>\(1\)/);
  });

  it('may add a note and nothing else: no reporting, ending, deleting or rating', () => {
    const html = coach({ state: { open: true, kind: 'injury', id: 'inj_1' } });
    expect(html).toContain('addNote');
    for (const k of ['reportInjury', '>ill<', 'injuryOver', 'illnessOver', 'declaredByMistake', 'removeFromHistory']) {
      expect(html).not.toContain(k);
    }
    expect(html).not.toContain('data-bother="');
  });

  it('is told plainly when the athlete has reported nothing', () => {
    expect(coach({ spans: [] })).toContain('>emptyCoach<');
  });
});

describe('the drawer’s words (showable-version/50)', () => {
  it('never says open or closed in the drawer or the button that opens it, in either language', () => {
    for (const cat of [en, da]) {
      const strings = [...Object.values(cat.HealthDrawer), cat.Calendar.healthButton] as string[];
      for (const s of strings) expect(s).not.toMatch(/\b(open|closed|åben|åbent|åbne|lukket)\b/i);
    }
  });

  it('names the button after the drawer: Injuries and illness, Skader og sygdom', () => {
    expect(en.HealthDrawer.title).toBe('Injuries and illness');
    expect(da.HealthDrawer.title).toBe('Skader og sygdom');
    expect(en.Calendar.healthButton).toBe(en.HealthDrawer.title);
    expect(da.Calendar.healthButton).toBe(da.HealthDrawer.title);
    expect(da.HealthDrawer.ongoing).toBe('Aktuelle');
  });
});
