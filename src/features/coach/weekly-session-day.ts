import { addDays, daysBetween } from '@/lib/date';
import { cycleAnchor, HEAD_COACH_LEAD_DAYS } from './week-draft';
import { currentBlock, type TrainingBlock } from './training-blocks';
import { effectiveWeeklySessionDay } from './weekly-offer';
import { ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';

/**
 * What the planning-day card says about the cycle (`training-architecture/28`)
 * — the pure half. The card on the Head Coach's plan tab used to be seven
 * buttons under a two-line label; it now states whose day it is, when the next
 * draft lands for each of them, and the week that draft covers. Those dates
 * come from the same arithmetic the draft itself runs on (`cycleAnchor`,
 * `HEAD_COACH_LEAD_DAYS`), never from copy, so the card cannot disagree with
 * the draft it describes. No clock: `today` is passed in, as everywhere.
 */

export interface NextDraftDates {
  /** The next Weekly Session Day — the day the athlete gets the proposal. */
  athleteSees: string;
  /** `HEAD_COACH_LEAD_DAYS` before that — the day the coach sees it first. */
  coachSees: string;
  /** The seven days that draft plans: the planning day and the six after. */
  weekStart: string;
  weekEnd: string;
}

/**
 * The next draft's dates, strictly after the current cycle's anchor: on the
 * planning day itself the draft has already landed, so "next" is a week on.
 */
export function nextDraftDates(today: string, weeklySessionDay: string | null | undefined): NextDraftDates {
  const athleteSees = addDays(cycleAnchor(today, weeklySessionDay), 7);
  return {
    athleteSees,
    coachSees: addDays(athleteSees, -HEAD_COACH_LEAD_DAYS),
    weekStart: athleteSees,
    weekEnd: addDays(athleteSees, 6),
  };
}

export interface RaceFacts {
  name: string;
  /** Whole weeks to race day, rounded up; 0 on race day and after. */
  weeksOut: number;
  /** The block today falls inside, or null outside every block. */
  blockName: string | null;
}

/**
 * The race and block facts the expanded card names, or null with no race —
 * the card then shortens its first step rather than inventing a horizon.
 */
export function raceFacts(
  today: string,
  horizon: { raceName: string; raceDate: string; blocks: TrainingBlock[] } | null,
): RaceFacts | null {
  if (!horizon) return null;
  const days = daysBetween(today, horizon.raceDate);
  return {
    name: horizon.raceName,
    weeksOut: Math.max(0, Math.ceil(days / 7)),
    blockName: currentBlock(today, horizon.blocks)?.name ?? null,
  };
}

// ── Changing the day ──────────────────────────────────────────────────────────

/** The card's choice state: the stored day, a tapped-but-unconfirmed one, and the one write to make. */
export interface DayChoice {
  current: string | null;
  proposed: string | null;
  /** The day to write, set by `confirm` alone; the card acts on it once and reports `written`. */
  write: string | null;
}

export type DayChoiceEvent = { type: 'tap'; day: string } | { type: 'confirm' } | { type: 'cancel' } | { type: 'written' };

/**
 * A tap proposes, never writes (Mads, 2026-09-17: the old row re-set the day
 * on every tap and was too easy to change every visit). Only `confirm` yields a
 * write, and only when something is proposed; `cancel` and a tap on the current
 * day leave the state as it was. Pure, so the confirm rule is a test and not a
 * click. One handler per event, so each is a line the gate can read.
 */
const TRANSITIONS: { [E in DayChoiceEvent as E['type']]: (state: DayChoice, event: E) => DayChoice } = {
  tap: (state, event) => (event.day === state.current ? state : { ...state, proposed: event.day, write: null }),
  confirm: (state) => (state.proposed ? { ...state, write: state.proposed } : state),
  cancel: (state) => ({ ...state, proposed: null, write: null }),
  written: (state) => ({ current: state.write, proposed: null, write: null }),
};

export function dayChoice(state: DayChoice, event: DayChoiceEvent): DayChoice {
  // The map is keyed by the discriminant, so the handler and the event agree by construction.
  return (TRANSITIONS[event.type] as (state: DayChoice, event: DayChoiceEvent) => DayChoice)(state, event);
}

/**
 * The name the card calls the athlete: their Preferred Name when set
 * (preferred-name/02), else null — and the card then says "the athlete", as
 * the ruling has it, never the account name.
 */
export function displayNameFor(preferred: string | null | undefined): string | null {
  const chosen = preferred?.trim();
  return chosen ? chosen : null;
}

// ── Weekday names ─────────────────────────────────────────────────────────────

const DAYS: readonly string[] = ONBOARDING_OPTIONS.days;
const DAY_KEYS = ['dayMonday', 'dayTuesday', 'dayWednesday', 'dayThursday', 'dayFriday', 'daySaturday', 'daySunday'] as const;

/** The `Settings` catalogue key naming a weekday; an unknown value reads as Sunday, as `effectiveWeeklySessionDay` does. */
export function dayMessageKey(day: string): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[DAYS.indexOf(day)] ?? 'daySunday';
}

/**
 * The weekday the coach first sees the draft: `HEAD_COACH_LEAD_DAYS` before
 * the athlete's day. Derived from the constant like the dates are, so the two
 * cannot disagree if the lead ever changes.
 */
export function coachSeesDay(weeklySessionDay: string | null | undefined): string {
  const index = DAYS.indexOf(effectiveWeeklySessionDay(weeklySessionDay));
  return DAYS[(index - HEAD_COACH_LEAD_DAYS + 7) % 7];
}

// ── The write ─────────────────────────────────────────────────────────────────

export type DayWriteResult = { ok: true } | { ok: false; reason: string };

/**
 * Confirm, as the card runs it: one write of the proposed day, then the state
 * the card shows next. A refused write keeps the stored day, drops the
 * proposal and hands back the reason for the notice. Nothing proposed, nothing
 * written. Pure apart from the `write` it is given, so the "writes once" rule
 * is a test with a mock rather than a click.
 */
/**
 * A write whose rejection is a refusal like any other. Both callers run inside
 * a `startTransition`, where a thrown error escapes to an error boundary and
 * replaces the page — so the one thing the card is for, saying what happened,
 * is the thing that cannot happen (CodeRabbit, PR #102).
 */
async function refusalOnThrow(write: () => Promise<DayWriteResult>): Promise<DayWriteResult> {
  try {
    return await write();
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function commitDayChoice(
  state: DayChoice,
  write: (day: string) => Promise<DayWriteResult>,
): Promise<{ state: DayChoice; error: string | null }> {
  const confirmed = dayChoice(state, { type: 'confirm' });
  if (!confirmed.write) return { state: confirmed, error: null };
  const result = await refusalOnThrow(() => write(confirmed.write as string));
  if (result.ok) return { state: dayChoice(confirmed, { type: 'written' }), error: null };
  return { state: dayChoice(confirmed, { type: 'cancel' }), error: result.reason };
}

/**
 * Got it, as the card runs it (`training-architecture/41`, review). The fold
 * closes only if the flag was actually stored: a refused write leaves the
 * instruction where it is and hands back the reason, the way a refused day
 * change does. Pure apart from the `write` it is given.
 */
export async function commitDismissal(
  write: () => Promise<DayWriteResult>,
): Promise<{ dismissed: boolean; error: string | null }> {
  const result = await refusalOnThrow(write);
  return result.ok ? { dismissed: true, error: null } : { dismissed: false, error: result.reason };
}
