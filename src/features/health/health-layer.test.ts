import { describe, it, expect } from 'vitest';
import type { IllnessRow, InjuryRow } from '@/db/schema';
import { currentStatus, glance, marksFor, spansFrom, type HealthSpan } from './health-layer';

/**
 * `training-architecture/06` — the health layer the calendar draws beside the
 * plan. Pure: rows in, spans out; spans and a week in, what to draw out.
 */
const injury = (over: Partial<InjuryRow> = {}): InjuryRow => ({
  id: 'inj_1',
  athleteId: 'a1',
  swim: 'full',
  bike: 'easy',
  run: 'none',
  name: null,
  openedAt: new Date('2026-09-02T09:30:00Z'),
  closedAt: null,
  bother: 3,
  ...over,
});

const illness = (over: Partial<IllnessRow> = {}): IllnessRow => ({
  id: 'ill_1',
  athleteId: 'a1',
  openedAt: new Date('2026-09-08T07:00:00Z'),
  closedAt: null,
  bother: null,
  ...over,
});

describe('spansFrom — rows become date spans', () => {
  it('turns an open injury into an open-ended span carrying its capacity and bother', () => {
    expect(spansFrom([injury()], [])).toEqual<HealthSpan[]>([
      {
        kind: 'injury',
        id: 'inj_1',
        from: '2026-09-02',
        to: null,
        capacity: { swim: 'full', bike: 'easy', run: 'none' },
        bother: 3,
        name: null,
        openedAt: new Date('2026-09-02T09:30:00Z'),
      },
    ]);
  });

  it('bounds a closed record by its close date', () => {
    const [span] = spansFrom([injury({ closedAt: new Date('2026-09-10T18:00:00Z') })], []);
    expect(span.to).toBe('2026-09-10');
  });

  it('turns an illness into a span with no capacity — it removes every discipline', () => {
    expect(spansFrom([], [illness()])).toEqual<HealthSpan[]>([
      { kind: 'illness', id: 'ill_1', from: '2026-09-08', to: null, bother: null, name: null, openedAt: new Date('2026-09-08T07:00:00Z') },
    ]);
  });

  it('carries the injury’s name and the raw openedAt, for the drawer line and the 24 h rule (showable-version/28a)', () => {
    const [span] = spansFrom([injury({ name: 'left knee', openedAt: new Date('2026-09-10T08:00:00Z') })], []);
    expect(span.name).toBe('left knee');
    expect(span.openedAt).toEqual(new Date('2026-09-10T08:00:00Z'));
    // An illness never has a name; an injury declared without one is null too.
    expect(spansFrom([], [illness()])[0].name).toBeNull();
    expect(spansFrom([injury({ name: null })], [])[0].name).toBeNull();
  });

  it('lists injuries before illnesses, each in the order given', () => {
    const ids = spansFrom([injury({ id: 'i2' }), injury({ id: 'i1' })], [illness()]).map((s) => s.id);
    expect(ids).toEqual(['i2', 'i1', 'ill_1']);
  });
});

describe('marksFor — the icons a session carries (showable-version/28a)', () => {
  const knee: HealthSpan = {
    kind: 'injury', id: 'i1', name: 'left knee', from: '2026-09-10', to: null,
    openedAt: new Date('2026-09-10T08:00Z'), capacity: { swim: 'full', bike: 'easy', run: 'none' }, bother: null,
  };
  const flu: HealthSpan = {
    kind: 'illness', id: 'l1', name: null, from: '2026-09-02', to: '2026-09-05',
    openedAt: new Date('2026-09-02T08:00Z'), bother: null,
  };

  it('an open injury marks every session from its start through today, whatever the discipline', () => {
    expect(marksFor('2026-09-12', [knee], '2026-09-14')).toEqual([{ kind: 'injury', open: true, label: 'left knee' }]);
    expect(marksFor('2026-09-10', [knee], '2026-09-14')).toHaveLength(1);
    expect(marksFor('2026-09-14', [knee], '2026-09-14')).toHaveLength(1);
    expect(marksFor('2026-09-09', [knee], '2026-09-14')).toEqual([]);
    // Never the future: nobody has said the athlete will still be hurt tomorrow.
    expect(marksFor('2026-09-15', [knee], '2026-09-14')).toEqual([]);
  });

  it('a closed record still marks its days, muted, forever', () => {
    expect(marksFor('2026-09-04', [flu], '2026-09-14')).toEqual([{ kind: 'illness', open: false, label: null }]);
    expect(marksFor('2026-09-05', [flu], '2026-09-14')).toHaveLength(1);
    expect(marksFor('2026-09-06', [flu], '2026-09-14')).toEqual([]);
  });

  it('a day inside both carries both, injury first', () => {
    const marks = marksFor('2026-09-11', [{ ...flu, from: '2026-09-11', to: null }, knee], '2026-09-14');
    expect(marks.map((m) => m.kind)).toEqual(['injury', 'illness']);
  });

});

describe('currentStatus — the status card reads today, never the past (showable-version/28e)', () => {
  const openedOn = (day: string) => new Date(`${day}T08:00:00Z`);
  const knee: HealthSpan = {
    kind: 'injury', id: 'i1', name: 'left knee', from: '2026-09-10', to: null,
    openedAt: openedOn('2026-09-10'), capacity: { swim: 'full', bike: 'easy', run: 'none' }, bother: null,
  };
  const flu: HealthSpan = { kind: 'illness', id: 'l1', name: null, from: '2026-09-02', to: '2026-09-05', openedAt: openedOn('2026-09-02'), bother: null };

  it('names the newest open injury and illness, and nothing that is closed', () => {
    const spans: HealthSpan[] = [
      { ...knee, id: 'k1', name: 'left knee', to: null, openedAt: openedOn('2026-09-10') },
      { ...knee, id: 'k0', name: 'ankle', to: '2026-09-12', openedAt: openedOn('2026-09-11') },
      { ...flu, to: '2026-09-09' },
    ];
    expect(currentStatus(spans)).toEqual({ injury: expect.objectContaining({ name: 'left knee' }), illness: null });
  });

  it('picks the newest of two open records of a kind, whatever order they arrive in', () => {
    const older = { ...knee, id: 'old', to: null, openedAt: openedOn('2026-09-01') };
    const newer = { ...knee, id: 'new', to: null, openedAt: openedOn('2026-09-12') };
    expect(currentStatus([older, newer]).injury?.id).toBe('new');
    expect(currentStatus([newer, older]).injury?.id).toBe('new');
  });

  it('keeps the first listed of two opened at the same instant — the repository lists them oldest first', () => {
    const first = { ...knee, id: 'first', to: null, openedAt: openedOn('2026-09-12') };
    const second = { ...knee, id: 'second', to: null, openedAt: openedOn('2026-09-12') };
    expect(currentStatus([first, second]).injury?.id).toBe('first');
  });

  it('reads an open illness as ill, and nothing at all as clean', () => {
    const ill = { ...flu, to: null };
    expect(currentStatus([ill])).toEqual({ injury: null, illness: ill });
    expect(currentStatus([])).toEqual({ injury: null, illness: null });
  });
});

describe('glance — what an injury prevents, at a glance', () => {
  it('names only the restricted disciplines, most restricted first', () => {
    expect(glance({ swim: 'full', bike: 'easy', run: 'none' })).toBe('no run · easy bike');
    expect(glance({ swim: 'easy', bike: 'none', run: 'none' })).toBe('no bike · no run · easy swim');
  });

  it('is empty for full capacity', () => {
    expect(glance({ swim: 'full', bike: 'full', run: 'full' })).toBe('');
  });

  it('uses only the capacity vocabulary — never a body part', () => {
    const text = glance({ swim: 'none', bike: 'easy', run: 'easy' });
    for (const word of text.split(/[ ·]+/)) {
      expect(['no', 'easy', 'swim', 'bike', 'run']).toContain(word);
    }
  });
});

describe('glanceParts — the same glance, for a renderer to translate', () => {
  it('lists the restricted disciplines most restricted first, and nothing at full capacity', async () => {
    const { glanceParts } = await import('./health-layer');
    expect(glanceParts({ swim: 'easy', bike: 'none', run: 'none' })).toEqual([
      { allowance: 'none', discipline: 'bike' },
      { allowance: 'none', discipline: 'run' },
      { allowance: 'easy', discipline: 'swim' },
    ]);
    expect(glanceParts({ swim: 'full', bike: 'full', run: 'full' })).toEqual([]);
  });
});
