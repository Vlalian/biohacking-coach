import { addDays } from '@/lib/date';
import { cycleAnchor, HEAD_COACH_LEAD_DAYS } from './week-draft';
import { currentBlock, type TrainingBlock } from './training-blocks';

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
export function nextDraftDates(
  today: string,
  weeklySessionDay: string | null | undefined,
  leadDays = HEAD_COACH_LEAD_DAYS,
): NextDraftDates {
  const athleteSees = addDays(cycleAnchor(today, weeklySessionDay), 7);
  return {
    athleteSees,
    coachSees: addDays(athleteSees, -leadDays),
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The race and block facts the expanded card names, or null with no race —
 * the card then shortens its first step rather than inventing a horizon.
 */
export function raceFacts(
  today: string,
  horizon: { raceName: string; raceDate: string; blocks: TrainingBlock[] } | null,
): RaceFacts | null {
  if (!horizon) return null;
  const days = (Date.parse(`${horizon.raceDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
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

/** The name the card calls the athlete: their Preferred Name when set (preferred-name/02), else the account name. */
export function displayNameFor(preferred: string | null | undefined, athleteName: string): string {
  const chosen = preferred?.trim();
  return chosen ? chosen : athleteName;
}
