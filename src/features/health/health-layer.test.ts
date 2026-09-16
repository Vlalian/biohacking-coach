import { describe, it, expect } from 'vitest';
import type { IllnessRow, InjuryRow } from '@/db/schema';
import { glance, layerForWeek, spansFrom, type HealthSpan } from './health-layer';

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
      },
    ]);
  });

  it('bounds a closed record by its close date', () => {
    const [span] = spansFrom([injury({ closedAt: new Date('2026-09-10T18:00:00Z') })], []);
    expect(span.to).toBe('2026-09-10');
  });

  it('turns an illness into a span with no capacity — it removes every discipline', () => {
    expect(spansFrom([], [illness()])).toEqual<HealthSpan[]>([
      { kind: 'illness', id: 'ill_1', from: '2026-09-08', to: null, bother: null },
    ]);
  });

  it('lists injuries before illnesses, each in the order given', () => {
    const ids = spansFrom([injury({ id: 'i2' }), injury({ id: 'i1' })], [illness()]).map((s) => s.id);
    expect(ids).toEqual(['i2', 'i1', 'ill_1']);
  });
});

describe('layerForWeek — what a week row draws', () => {
  const TODAY = '2026-09-11';
  const week = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
  const ill: HealthSpan = { kind: 'illness', id: 'ill_1', from: '2026-09-08', to: null, bother: null };
  const inj: HealthSpan = {
    kind: 'injury', id: 'inj_1', from: '2026-08-20', to: null,
    capacity: { swim: 'full', bike: 'easy', run: 'none' }, bother: 3,
  };

  it('marks the ill days from the declaration up to today, not into the future', () => {
    const layer = layerForWeek(week, [ill], TODAY);
    expect(layer.days.map((d) => d.ill)).toEqual([false, true, true, true, true, false, false]);
  });

  it('bounds a closed illness by its close, even when today is later', () => {
    const closed = { ...ill, to: '2026-09-09' };
    expect(layerForWeek(week, [closed], TODAY).days.map((d) => d.ill)).toEqual([
      false, true, true, false, false, false, false,
    ]);
  });

  it('lists an open injury on the week as a standing state, whatever the days', () => {
    const layer = layerForWeek(week, [inj], TODAY);
    expect(layer.injuries.map((s) => s.id)).toEqual(['inj_1']);
    expect(layer.hasIllness).toBe(false);
  });

  it('shows an injury only on weeks it was open, and an illness only on weeks it touched', () => {
    const later = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    const closedInj = { ...inj, to: '2026-09-30' };
    const layer = layerForWeek(later, [closedInj, ill], '2026-10-09');
    expect(layer.injuries).toEqual([]);
    // Still ill: an open illness runs to today, and today is in this week.
    expect(layer.illnesses.map((s) => s.id)).toEqual(['ill_1']);
    expect(layer.hasIllness).toBe(true);
    expect(layer.days.every((d) => d.ill)).toBe(false);
    expect(layer.days.filter((d) => d.ill)).toHaveLength(5);
  });

  it('names the illness each ill day belongs to, and lists the illnesses the week touched', () => {
    const layer = layerForWeek(week, [ill, inj], TODAY);
    expect(layer.days[1]).toEqual({ date: '2026-09-08', ill: true, illnessId: 'ill_1' });
    expect(layer.days[0]).toEqual({ date: '2026-09-07', ill: false, illnessId: null });
    expect(layer.illnesses.map((s) => s.id)).toEqual(['ill_1']);
  });

  it('lists no illness on a week it never touched, even while it is open elsewhere', () => {
    const earlier = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];
    const layer = layerForWeek(earlier, [ill], TODAY);
    expect(layer.illnesses).toEqual([]);
    expect(layer.hasIllness).toBe(false);
  });

  it('draws nothing for a healthy week', () => {
    const layer = layerForWeek(week, [], TODAY);
    expect(layer.hasIllness).toBe(false);
    expect(layer.injuries).toEqual([]);
    expect(layer.illnesses).toEqual([]);
    expect(layer.days.some((d) => d.ill)).toBe(false);
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
