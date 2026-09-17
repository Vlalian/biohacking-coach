import { addDays, weekStartOf } from '@/lib/date';
import type { Citation } from '@/lib/citation';
import { excludedBetween, hasAPlannableDay, planningWindow, type PlanningWindow } from './planning-window';
import type { ProposedSession } from './weekly-session';
import { effectiveWeeklySessionDay, WEEKDAYS } from './weekly-offer';

/**
 * The Coach drafting a week on its own (`training-architecture/16`) — the pure
 * half. Which week is due, what its window is, what the default week looks
 * like before the Coach touches it, and which draft is still waiting for an
 * answer. No clock, no database, no network: `today` is passed in, as
 * everywhere in this codebase.
 *
 * A drafted week is a **proposal, never a write** (Mads, 2026-09-14): it lives
 * in the `events` log until the athlete accepts it (`/18`), and nothing here
 * knows how to reach the calendar.
 */

// ── Events ────────────────────────────────────────────────────────────────────

/**
 * The event types a week draft moves through. Declared here, once, so the
 * repository, 17's Head Coach review and 18's athlete decision name the same
 * strings. `approved` and `withdrawn` are 17's and 18's; a `week_plan_written`
 * or `week_plan_declined` carrying a `weekStart` (18) resolves a draft too.
 */
export const WEEK_DRAFT_EVENT = {
  drafted: 'week_drafted',
  approved: 'week_draft_approved',
  withdrawn: 'week_draft_withdrawn',
} as const;

/** The events that end a draft's wait for an answer. */
const RESOLVING_TYPES: readonly string[] = [
  'week_plan_written',
  'week_plan_declined',
  WEEK_DRAFT_EVENT.withdrawn,
];

/** A drafted week, as staged — or as a Head Coach approved it (`/17`). */
export interface WeekDraft {
  id: string;
  /** Monday of the week it plans, `YYYY-MM-DD`. */
  weekStart: string;
  /** The first day the athlete may see it — their Weekly Session Day; a linked Head Coach sees it the day before. */
  visibleFrom: string;
  sessions: ProposedSession[];
  citations: Citation[];
  /** True when this is the Head Coach's approved version rather than the Coach's draft. */
  approved: boolean;
  createdAt: Date;
}

/** Whether the athlete may see this draft on `asOf` — the Head Coach's day-early preview is the only reason to say no. */
export function visibleTo(draft: WeekDraft, asOf: string): boolean {
  return asOf >= draft.visibleFrom;
}

/** The minimal event shape {@link pendingWeekDraft} reads — `pendingProposal`'s twin. */
export interface WeekDraftEvent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}

function weekStartOfPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const ws = (payload as Record<string, unknown>).weekStart;
  return typeof ws === 'string' ? ws : null;
}

/**
 * The payload as a record carrying a `sessions` list, or null. The week was
 * already matched by {@link weekStartOfPayload} before this is asked, so the
 * only thing that can still make a `week_drafted` row not a draft is a
 * missing session list.
 */
function draftPayloadOf(payload: unknown): (Record<string, unknown> & { sessions: unknown[] }) | null {
  const rec = payload as Record<string, unknown>;
  return Array.isArray(rec.sessions) ? (rec as Record<string, unknown> & { sessions: unknown[] }) : null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function arrayOr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function draftOf(event: WeekDraftEvent, weekStart: string): WeekDraft | null {
  const rec = draftPayloadOf(event.payload);
  if (!rec) return null;
  return {
    id: event.id,
    weekStart,
    visibleFrom: stringOr(rec.visibleFrom, weekStart),
    sessions: rec.sessions as ProposedSession[],
    citations: arrayOr<Citation>(rec.citations),
    approved: event.type === WEEK_DRAFT_EVENT.approved,
    createdAt: event.createdAt,
  };
}

/** The two event types that carry a whole draft: the Coach's, and the Head Coach's approved version of it. */
const DRAFT_CARRYING_TYPES: readonly string[] = [WEEK_DRAFT_EVENT.drafted, WEEK_DRAFT_EVENT.approved];

/**
 * The draft a week is still waiting on, or null.
 *
 * Walks the week's events oldest-first: a `week_drafted` becomes the pending
 * one, a `week_draft_approved` (the Head Coach's version, `/17`) replaces it —
 * the newest of either wins, one pending per week — and a later written /
 * declined / withdrawn event for the same week clears it. Events for other
 * weeks are ignored. Pure: events in, decision out — the same shape as
 * `pendingProposal`, keyed on `weekStart` because a silent draft has no
 * conversation to be keyed on.
 */
export function pendingWeekDraft(events: WeekDraftEvent[], weekStart: string): WeekDraft | null {
  let pending: WeekDraft | null = null;
  for (const event of events) {
    if (weekStartOfPayload(event.payload) !== weekStart) continue;
    if (DRAFT_CARRYING_TYPES.includes(event.type)) pending = draftOf(event, weekStart) ?? pending;
    else if (RESOLVING_TYPES.includes(event.type)) pending = null;
  }
  return pending;
}

// ── Which week, and its window ────────────────────────────────────────────────

/**
 * How many days before the athlete's Weekly Session Day a linked Head Coach
 * gets the draft (Mads, 2026-09-14). A ruling, so it lives here beside the
 * cycle arithmetic it feeds and nowhere else.
 */
export const HEAD_COACH_LEAD_DAYS = 1;

function weekdayIndex(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/**
 * The Monday of the week the Coach should be drafting for today.
 *
 * A cycle is anchored on the athlete's Weekly Session Day: the draft made on
 * that day plans the week *after* it. So the current cycle is the most recent
 * such day on or before today (plus `leadDays`, which is how a Head Coach sees
 * the draft a day early — `/17`), and the week due is the one after that day's
 * week. Before this week's day the previous cycle is still current, so the
 * answer is this week — whether anything is done about it (already drafted,
 * already held by talking) is the service gate's question, not this one's.
 */
export function draftDueWeek(today: string, weeklySessionDay: string | null | undefined, leadDays = 0): string {
  return addDays(weekStartOf(cycleAnchor(today, weeklySessionDay, leadDays)), 7);
}

/**
 * The date of the Weekly Session Day the current cycle is anchored on: the
 * most recent such day on or before today plus `leadDays`. It is the day the
 * athlete gets the proposal — a linked Head Coach sees it `leadDays` earlier.
 */
export function cycleAnchor(today: string, weeklySessionDay: string | null | undefined, leadDays = 0): string {
  const target = WEEKDAYS.indexOf(effectiveWeeklySessionDay(weeklySessionDay));
  const horizon = addDays(today, leadDays);
  const back = (weekdayIndex(horizon) - target + 7) % 7;
  return addDays(horizon, -back);
}

/**
 * The window a draft for `weekStart` may cover: that week, starting today if
 * the week has already begun (the past is not plannable), with the athlete's
 * excluded days resolved. Null when no day of it can hold training.
 *
 * Beside `planningWindow`, deliberately not inside it. That function is
 * "the remainder of this week, always" and PR #57 bounded the Weekly Session's
 * write to it on purpose; a draft for next week needs a window the
 * conversational path must not gain by accident.
 */
export function weekWindow(
  weekStart: string,
  today: string,
  fixedConstraints: string[] = [],
  unavailableDates: string[] = [],
): PlanningWindow | null {
  // Stryker disable next-line EqualityOperator: equivalent — on the Monday itself both branches are that Monday.
  const start = today > weekStart ? today : weekStart;
  const end = addDays(weekStart, 6);
  if (!hasAPlannableDay(start, end, fixedConstraints, unavailableDates)) return null;
  return {
    start,
    end,
    excludedDates: excludedBetween(start, end, fixedConstraints, unavailableDates),
    fellThrough: false,
  };
}

/**
 * A week as a whole, Monday to Sunday, whatever today is — the window a late
 * acceptance validates against (`/18`; Mads, 2026-09-15: the week is written
 * whole, as drafted). Excluded days are still excluded: a session on a day the
 * athlete ruled out was never valid. Never null — an all-excluded week simply
 * validates to nothing, which the caller refuses.
 */
export function wholeWeekWindow(
  weekStart: string,
  fixedConstraints: string[] = [],
  unavailableDates: string[] = [],
): PlanningWindow {
  const end = addDays(weekStart, 6);
  return {
    start: weekStart,
    end,
    excludedDates: excludedBetween(weekStart, end, fixedConstraints, unavailableDates),
    fellThrough: false,
  };
}

/**
 * The window a *conversation* may write (`training-architecture/20`): the whole
 * of the week a draft was brought in to discuss, when that week is this one or
 * the next; otherwise the remainder of this week, exactly as `planningWindow`
 * has always bounded it.
 *
 * Whole, not from today — the same ruling as a late accept from the calendar
 * (Mads, 2026-09-15: the week is written whole, as drafted). A current-week
 * draft discussed on Wednesday still carries its Monday session, and a window
 * that dropped it would refuse the very proposal the athlete came to confirm.
 *
 * A handoff for a week already gone, or further out than next week, is ignored
 * rather than honoured: Coach Chat is the resting conversation and lives for
 * months, so "the week it once discussed" must stop being its window once that
 * week is no longer current.
 */
export function conversationWindow(
  today: string,
  discussedWeekStart: string | null,
  fixedConstraints: string[],
  unavailableDates: string[],
): PlanningWindow {
  const thisWeek = weekStartOf(today);
  const current = discussedWeekStart === thisWeek || discussedWeekStart === addDays(thisWeek, 7);
  return current
    ? wholeWeekWindow(discussedWeekStart, fixedConstraints, unavailableDates)
    : planningWindow(today, fixedConstraints, unavailableDates);
}

/** The week after today's, as a window — the common case for a draft. */
export function nextWeekWindow(
  today: string,
  fixedConstraints: string[] = [],
  unavailableDates: string[] = [],
): PlanningWindow | null {
  return weekWindow(addDays(weekStartOf(today), 7), today, fixedConstraints, unavailableDates);
}

// ── The skeleton ──────────────────────────────────────────────────────────────

export type SkeletonRole = 'rest' | 'long' | 'hard' | 'easy';

export interface SkeletonDay {
  date: string;
  role: SkeletonRole;
}

const MIN_DAYS_FOR_STRUCTURE = 3;
/** The hard day sits at least this many days before the long one. */
const HARD_TO_LONG_GAP = 2;

/**
 * The default week, as roles the Coach adjusts (Mads, 2026-09-09: "the
 * structure should be the default, and then the coach can make changes").
 *
 * **The rule, stated here and nowhere else** (*Distancens Arkitektur* §05, the
 * weekly template, as code): excluded days are `rest`; the last plannable
 * weekend day is `long` (or the last plannable day of the week when neither
 * weekend day is free); one `hard` day at least two days before `long`, the
 * latest such day so it sits midweek; the day after `long` is never hard;
 * everything else is `easy`. A week with fewer than three plannable days gets
 * no structure — every plannable day is `easy`, because a long/hard pair needs
 * room to recover from. Roles only: no minutes, no zones — the model fills those.
 */
export function weekSkeleton(window: PlanningWindow): SkeletonDay[] {
  const excluded = new Set(window.excludedDates);
  const days: SkeletonDay[] = [];
  for (let d = window.start; d <= window.end; d = addDays(d, 1)) {
    days.push({ date: d, role: excluded.has(d) ? 'rest' : 'easy' });
  }
  const plannable = days.filter((d) => d.role !== 'rest');
  if (plannable.length < MIN_DAYS_FOR_STRUCTURE) return days;

  const long = longDayOf(plannable);
  long.role = 'long';
  const hard = hardDayOf(plannable, long.date);
  if (hard) hard.role = 'hard';
  return days;
}

/**
 * The last plannable day. In a Monday–Sunday window that *is* the last
 * plannable weekend day whenever a weekend day is plannable at all, so the
 * "prefer the weekend" clause the rule states in words needs no code — the
 * mutation gate proved the two readings identical (2026-09-15).
 */
function longDayOf(plannable: SkeletonDay[]): SkeletonDay {
  return plannable[plannable.length - 1];
}

/**
 * The latest plannable day at least the gap before the long one, or none.
 * Every plannable day is still `easy` here except the long one, and that sits
 * after the cutoff by construction — so no role check is needed.
 */
function hardDayOf(plannable: SkeletonDay[], longDate: string): SkeletonDay | undefined {
  const cutoff = addDays(longDate, -HARD_TO_LONG_GAP);
  return [...plannable].reverse().find((d) => d.date <= cutoff);
}

/** The fixed user turn that opens a draft — never persisted. */
export const WEEK_DRAFT_OPENER = "Draft next week's plan.";
