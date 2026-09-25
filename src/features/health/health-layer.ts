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
  /** The injury's short name ("left knee"), or null: an illness has none. */
  name: string | null;
  /** When it was declared, to the second — which open record is the newest (`currentStatus`). */
  openedAt: Date;
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
        name: r.name,
        openedAt: r.openedAt,
      }),
    ),
    ...illnesses.map(
      (r): HealthSpan => ({
        kind: 'illness',
        id: r.id,
        from: dateKey(r.openedAt),
        to: r.closedAt ? dateKey(r.closedAt) : null,
        bother: r.bother,
        name: null,
        openedAt: r.openedAt,
      }),
    ),
  ];
}

/** One icon on a session chip: which kind, whether still open, and the injury's name if any. */
export interface HealthMark {
  kind: 'injury' | 'illness';
  /** Signal while the record is open; muted once it is over — but never removed. */
  open: boolean;
  label: string | null;
}

/** Whether a span covers a date, with an open span running to today and never past it. */
function covers(span: HealthSpan, date: string, todayKey: string): boolean {
  return date >= span.from && date <= (span.to ?? todayKey);
}

/**
 * The marks a recorded session on `date` carries (`showable-version/28a`):
 * every injury whose span covers the day, whatever the discipline — "left knee"
 * does not say running is out, so the mark is not a per-discipline judgement —
 * and every illness likewise. Injuries first. A closed record keeps marking
 * its days forever, muted: a session done hurt was done hurt. Never a future
 * day, because an open span ends at today.
 */
export function marksFor(date: string, spans: readonly HealthSpan[], todayKey: string): HealthMark[] {
  const mark = (span: HealthSpan): HealthMark => ({ kind: span.kind, open: span.to === null, label: span.name });
  const covering = spans.filter((s) => covers(s, date, todayKey));
  return [...covering.filter((s) => s.kind === 'injury'), ...covering.filter((s) => s.kind === 'illness')].map(mark);
}

/**
 * What the calendar's one status card says (`showable-version/28e`, Mads
 * 2026-09-19): the newest **open** record of each kind, or null. It reads
 * today and nothing else — a healed record is history, which lives in the
 * muted marks on the days and the drawer's History fold, never on the card.
 */
export function currentStatus(spans: readonly HealthSpan[]): {
  injury: HealthSpan | null;
  illness: HealthSpan | null;
} {
  const newestOpen = (kind: HealthSpan['kind']) =>
    spans
      .filter((s) => s.kind === kind && s.to === null)
      .reduce<HealthSpan | null>((best, s) => (best && best.openedAt >= s.openedAt ? best : s), null);
  return { injury: newestOpen('injury'), illness: newestOpen('illness') };
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
