import type { IllnessRow, InjuryRow } from '@/db/schema';
import { dateKey } from '@/lib/date';
import { DISCIPLINES, type Capacity, type Discipline } from './capacity';

/**
 * The health layer the calendar draws **beside** the plan
 * (`training-architecture/06`).
 *
 * Slice 04 made "declaring never mutates the plan" true: no session changes
 * status when an Injury or Illness is declared. This is what makes that honest.
 * Without it the athlete spends the week looking at sessions they could not do
 * with nothing on screen saying why — a calendar that has quietly become a
 * fiction. Drawing the health state as its own layer lets the plan stay
 * untouched: the athlete sees both what was planned and why it did not happen.
 *
 * An **Illness** is a span of days — a state of the athlete across time, drawn
 * from the declaration to today (or to its close). An **Injury** is a standing
 * state, not a set of days: it is listed on every week it was open, with what
 * it prevents legible at a glance.
 *
 * Pure: rows in, spans out; a week and spans in, what to draw out. Nothing here
 * reads the detail thread, and nothing here could — the span carries capacity
 * and the Bother Rating (both for human eyes on this side of ADR 0011's split),
 * and no field a note could arrive in.
 */
export interface HealthSpan {
  kind: 'injury' | 'illness';
  id: string;
  /** Inclusive date key of the declaration. */
  from: string;
  /** Inclusive date key of the close, or null while open. */
  to: string | null;
  /** What the injury prevents. Absent on an illness, which removes everything. */
  capacity?: Capacity;
  /** The Bother Rating, 1–5, or null when the athlete did not say. */
  bother: number | null;
}

export function spansFrom(
  injuries: readonly InjuryRow[],
  illnesses: readonly IllnessRow[],
): HealthSpan[] {
  return [
    ...injuries.map(
      (r): HealthSpan => ({
        kind: 'injury',
        id: r.id,
        from: dateKey(r.openedAt),
        to: r.closedAt ? dateKey(r.closedAt) : null,
        capacity: { swim: r.swim, bike: r.bike, run: r.run } as Capacity,
        bother: r.bother,
      }),
    ),
    ...illnesses.map(
      (r): HealthSpan => ({
        kind: 'illness',
        id: r.id,
        from: dateKey(r.openedAt),
        to: r.closedAt ? dateKey(r.closedAt) : null,
        bother: r.bother,
      }),
    ),
  ];
}

export interface WeekHealthLayer {
  /**
   * One entry per day of the week, in order: whether the athlete was ill that
   * day, and which Illness — so a click on the band opens the right record.
   */
  days: { date: string; ill: boolean; illnessId: string | null }[];
  hasIllness: boolean;
  /** The injuries open at any point during this week, in the order given. */
  injuries: HealthSpan[];
  /** The illnesses that touched this week, in the order given. */
  illnesses: HealthSpan[];
}

/**
 * What a week row draws. `todayKey` closes every open-ended span: an illness
 * declared on Monday is drawn through today and not into next week, because
 * nobody has said the athlete will still be ill tomorrow.
 */
export function layerForWeek(
  weekDates: readonly string[],
  spans: readonly HealthSpan[],
  todayKey: string,
): WeekHealthLayer {
  const covers = (span: HealthSpan, date: string) =>
    date >= span.from && date <= (span.to ?? todayKey);
  const overlapsWeek = (span: HealthSpan) => weekDates.some((date) => covers(span, date));

  const illnesses = spans.filter((s) => s.kind === 'illness');
  const days = weekDates.map((date) => {
    const covering = illnesses.find((s) => covers(s, date));
    return { date, ill: covering !== undefined, illnessId: covering?.id ?? null };
  });

  return {
    days,
    hasIllness: days.some((d) => d.ill),
    injuries: spans.filter((s) => s.kind === 'injury' && overlapsWeek(s)),
    illnesses: illnesses.filter(overlapsWeek),
  };
}

/**
 * What an injury prevents, in a few words: "no run · easy bike". Restricted
 * disciplines only, most restricted first; empty at full capacity. The
 * vocabulary is `capacity.ts`'s and nothing else — there is no column for a
 * body part, so there is nothing else it *could* say.
 */
export function glance(capacity: Capacity): string {
  return glanceParts(capacity)
    .map((p) => `${p.allowance === 'none' ? 'no' : 'easy'} ${p.discipline}`)
    .join(' · ');
}

/** One restricted discipline, for a renderer to translate. Most restricted first. */
export interface GlancePart {
  allowance: 'none' | 'easy';
  discipline: Discipline;
}

/**
 * The same glance as parts, so the UI can render it in the athlete's language:
 * `glance()` is the English sentence the tests read; a component maps each part
 * to a message key instead.
 */
export function glanceParts(capacity: Capacity): GlancePart[] {
  const of = (allowance: 'none' | 'easy') =>
    DISCIPLINES.filter((d) => capacity[d] === allowance).map((discipline) => ({ allowance, discipline }));
  return [...of('none'), ...of('easy')];
}
