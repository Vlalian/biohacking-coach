import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CoachChore } from '@/features/coach/coach-chores';

/**
 * `training-architecture/19` — the login popup, first render.
 * `renderToStaticMarkup` like `block-panel.test.tsx`: what is asserted is what
 * is in the markup, and what is not.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The server actions' import chain reaches auth and the database; a first
// render never calls them.
vi.mock('./coach/athlete/[athleteId]/block-actions', () => ({
  repinBlockSetAction: vi.fn(),
  restartBlockSetAction: vi.fn(),
}));

const { CoachChoresDialog, CoachChoresDialogView, rowAfterResult, isOpen, choreKey, rowFor } = await import('./coach-chores-dialog');

const SARAH: CoachChore = {
  kind: 'repin-block-set',
  athleteId: 'a1',
  athleteName: 'Sarah',
  raceId: 'r1',
  raceName: 'Ironman Copenhagen',
  raceDate: '2027-09-01',
  lastBlockName: 'Taper',
  lastBlockEnd: '2027-08-15',
  version: 3,
  repair: { kind: 'repin' },
};

const THOMAS: CoachChore = {
  ...SARAH,
  athleteId: 'a2',
  athleteName: 'Thomas',
  raceName: 'Challenge Roth',
  raceDate: '2027-01-10',
  repair: { kind: 'restart', dropped: ['Sharpen', 'Taper'] },
};

const noop = () => {};

describe('CoachChoresDialogView', () => {
  const html = renderToStaticMarkup(<CoachChoresDialogView chores={[SARAH, THOMAS]} onClose={noop} />);

  it('is a modal dialog with one row per stale set, saying what moved and what still ends where', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('title(count=2)');
    expect(html.match(/<li\b/g)).toHaveLength(2);
    expect(html).toContain('moved(athlete=Sarah,race=Ironman Copenhagen,from=2027-08-15,to=2027-09-01)');
    expect(html).toContain('stillEnds(block=Taper,day=2027-08-15)');
    expect(html).toContain('moved(athlete=Thomas,race=Challenge Roth,from=2027-08-15,to=2027-01-10)');
  });

  it('offers Re-pin to the new date on a row that can be re-pinned, and Re-pin all below', () => {
    expect(html).toContain('repin(day=2027-09-01)');
    expect(html).toContain('repinAll()');
    expect(html).toContain('notNow()');
    expect(html).not.toContain('close()');
  });

  it('offers Start over from the draft on a row too stale to re-pin, and says why', () => {
    expect(html).toContain('restart()');
    expect(html).toContain('tooFew(dropped=Sharpen · Taper)');
    expect(html).not.toContain('repin(day=2027-01-10)');
  });

  it('shows no Re-pin all for a single row — one button is the whole dialog', () => {
    const one = renderToStaticMarkup(<CoachChoresDialogView chores={[SARAH]} onClose={noop} />);
    expect(one).toContain('repin(day=2027-09-01)');
    expect(one).not.toContain('repinAll()');
  });
});

describe('CoachChoresDialog — the wrapper', () => {
  it('renders nothing on the server, and nothing at all with no chores', () => {
    // The server snapshot is "dismissed": the HTML carries no dialog, so the
    // first client render matches and the real session flag decides after
    // hydration. Static markup is the server render.
    expect(renderToStaticMarkup(<CoachChoresDialog chores={[SARAH]} />)).toBe('');
    expect(renderToStaticMarkup(<CoachChoresDialog chores={[]} />)).toBe('');
  });

  it('remembers "Not now" in sessionStorage, never in anything durable', () => {
    const source = readFileSync(fileURLToPath(new URL('./coach-chores-dialog.tsx', import.meta.url)), 'utf8');
    expect(source).toContain('sessionStorage');
    expect(source).not.toMatch(/localStorage|document\.cookie/);
  });
});

describe('rowAfterResult — what a row shows after the server answered', () => {
  const repin = { kind: 'repin' as const };

  it('a landed repair is done', () => {
    expect(rowAfterResult(repin, { ok: true, version: 4 })).toEqual({ kind: 'done' });
  });

  it('too few survivors turns the row into the draft offer, naming what would go', () => {
    expect(rowAfterResult(repin, { ok: false, reason: 'too-few-blocks', dropped: ['Taper'] })).toEqual({
      kind: 'idle',
      repair: { kind: 'restart', dropped: ['Taper'] },
    });
  });

  it('a set that is no longer stale, or gone, is a row with nothing left to do', () => {
    expect(rowAfterResult(repin, { ok: false, reason: 'not-stale' })).toEqual({ kind: 'done' });
    expect(rowAfterResult(repin, { ok: false, reason: 'no-set' })).toEqual({ kind: 'done' });
  });

  it('a conflict, a severed link or a refused caller is an error that keeps the button', () => {
    expect(
      rowAfterResult(repin, { ok: false, reason: 'conflict', current: { version: 5, startDate: 'x', blocks: [] } }),
    ).toEqual({ kind: 'error', reason: 'conflict', repair: repin });
    expect(rowAfterResult(repin, { ok: false, reason: 'not-linked' })).toEqual({
      kind: 'error',
      reason: 'not-linked',
      repair: repin,
    });
    expect(rowAfterResult(repin, { ok: false, reason: 'not-a-coach' })).toMatchObject({ kind: 'error' });
  });

  it('row state follows the chore, not its position — a refresh that drops one athlete cannot hand their button to the next', () => {
    // Spec review 2026-09-19: rows were index-keyed, so after a conflict's
    // router.refresh() shrank [Sarah, Thomas] to [Thomas], Sarah's error row
    // (and Sarah's repair kind) rendered under Thomas, and "Re-pin" would
    // have sent Thomas's set Sarah's repair. Keyed by athlete + race, a chore
    // that has no row yet is idle with its own repair, and a row whose chore
    // is gone is simply never read.
    const rows = { [choreKey(SARAH)]: { kind: 'error' as const, reason: 'conflict', repair: SARAH.repair } };
    expect(rowFor(rows, THOMAS)).toEqual({ kind: 'idle', repair: THOMAS.repair });
    expect(rowFor(rows, SARAH)).toEqual({ kind: 'error', reason: 'conflict', repair: SARAH.repair });
    expect(choreKey(SARAH)).toBe('a1:r1');
    expect(choreKey(THOMAS)).not.toBe(choreKey(SARAH));
  });

  it('isOpen: idle and error rows still have a button; pending and done do not', () => {
    expect(isOpen({ kind: 'idle', repair: repin })).toBe(true);
    expect(isOpen({ kind: 'error', reason: 'conflict', repair: repin })).toBe(true);
    expect(isOpen({ kind: 'pending', repair: repin })).toBe(false);
    expect(isOpen({ kind: 'done' })).toBe(false);
  });
});
