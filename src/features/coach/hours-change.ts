/**
 * An hours change asks when it applies (showable-version/61) — the pure half.
 *
 * Changing hours per week redraws the upcoming weeks the structure still owns.
 * A drafted week the athlete has not decided on was drafted from the old hours,
 * so the athlete chooses: start from that week (it is redrawn, its draft
 * withdrawn and drafted again at once), or start from the week after (the draft
 * stays decidable). The current week is never touched, and a draft still in a
 * linked Head Coach's preview is never thrown away.
 *
 * No database, no clock, no Coach call: client-safe, so the Settings dialog can
 * import its types.
 */

import { addDays, weekStartOf } from '@/lib/date';
import type { WeekDraft } from './week-draft';
import { PLAN_EVENT } from './plan-proposal';

/** Where the new hours start: the week with the waiting draft, or the week after it. */
export const START_FROM = ['waiting-week', 'week-after'] as const;
export type StartFrom = (typeof START_FROM)[number];

export function isStartFrom(value: unknown): value is StartFrom {
  return (START_FROM as readonly unknown[]).includes(value);
}

/**
 * What the confirm dialog asks, given what an hours change would touch:
 * - `drafting`: Momentum is writing the waiting week right now, so the dialog
 *   says so and lets the athlete try again, rather than racing the draft;
 * - `choose`: a draft the athlete can see is waiting, so they pick the week;
 * - `coach-preparing`: the waiting draft is still in a linked Head Coach's
 *   preview, so only the week after is offered — the coach's work stays;
 * - `confirm`: nothing to keep, so a plain confirm that says which weeks change,
 *   naming next week when it is already planned and stays as it is.
 */
export type HoursChangePreview =
  | { kind: 'drafting'; week: string }
  | { kind: 'choose'; waitingWeek: string; weeks: string[]; weeksIfKept: string[] }
  | { kind: 'coach-preparing'; waitingWeek: string; weeks: string[] }
  | { kind: 'confirm'; weeks: string[]; plannedWeek: string | null };

export type HoursChangeFacts = {
  today: string;
  /** The weeks the change would redraw (`previewRefill`). */
  weeks: string[];
  /** The week a draft is being written for right now, if any (`draftInFlight`). */
  inFlightWeek: string | null;
  /** The nearest undecided draft for an upcoming week, if any. */
  waiting: WeekDraft | null;
  /** Whether next week is already planned (accepted), so the change starts after it. */
  nextWeekPlanned: boolean;
};

function waitingChoice(waiting: WeekDraft, weeks: string[], today: string): HoursChangePreview {
  const waitingWeek = waiting.weekStart;
  const others = weeks.filter((w) => w !== waitingWeek);
  // Before `visibleFrom` the draft is the Head Coach's preview (`visibleTo`).
  if (today < waiting.visibleFrom) return { kind: 'coach-preparing', waitingWeek, weeks: others };
  return { kind: 'choose', waitingWeek, weeks, weeksIfKept: others };
}

export function hoursChangePreview(facts: HoursChangeFacts): HoursChangePreview {
  const { today, weeks, inFlightWeek, waiting, nextWeekPlanned } = facts;
  // Only a later week's draft can race the change; this week's own first draft cannot.
  if (inFlightWeek && inFlightWeek > weekStartOf(today)) return { kind: 'drafting', week: inFlightWeek };
  if (waiting) return waitingChoice(waiting, weeks, today);
  return { kind: 'confirm', weeks, plannedWeek: nextWeekPlanned ? addDays(weekStartOf(today), 7) : null };
}

/** The event an hours change records, naming the week whose draft was kept on the old hours, if any. */
export const HOURS_CHANGED_EVENT = 'hours_changed';


/** The minimal shape of an event this module reads. */
export type MarkerEvent = { type: string; payload: unknown };

const payloadField = (event: MarkerEvent, field: string): unknown =>
  (event.payload as Record<string, unknown> | null)?.[field];

/**
 * Whether `weekStart` still holds arithmetic drawn from the old hours: the
 * latest hours change kept that week's draft, and no decline of that week has
 * come since. Declining it is the moment it moves to the new hours (Mads,
 * 2026-10-01), once. A later hours change keeps its own week, or none.
 * `events` oldest first.
 */
export function keptWeekStale(events: readonly MarkerEvent[], weekStart: string): boolean {
  let stale = false;
  for (const event of events) {
    if (event.type === HOURS_CHANGED_EVENT) stale = payloadField(event, 'keptWeek') === weekStart;
    else if (event.type === PLAN_EVENT.declined && payloadField(event, 'weekStart') === weekStart) stale = false;
  }
  return stale;
}
