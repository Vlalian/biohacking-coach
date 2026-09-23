import { RACE_DISTANCES, type RaceDistance } from '@/lib/race-distances';
import { isCalendarDate } from '@/lib/calendar-date';
import type { ExperienceLevel } from './onboarding-flow';

/**
 * The races an athlete has already finished (`training-architecture/35`).
 *
 * "How many Ironmans have you done?" was the wrong question — "each race is a
 * different thing" (the athlete friend, 2026-09-19). So the athlete lists them,
 * one entry each: distance, date, finish time if they want, a note. Zero
 * entries is an answer. The **experience level is derived** from the list and
 * never asked; it keeps the three values the rest of the app reads.
 *
 * Pure: `today` is passed in, so a date "not after today" is testable.
 */
export interface PastRace {
  distance: RaceDistance;
  /** `YYYY-MM-DD`, not after today. */
  date: string;
  /** Finish time in seconds, or null when not given. */
  finishSeconds: number | null;
  note: string | null;
}

/** How many finished races make an intermediate, and a veteran (D1, 2026-09-21). */
const INTERMEDIATE_FROM = 1;
const VETERAN_FROM = 4;

/** 0 finished races → beginner; 1–3 → intermediate; 4 or more → veteran. */
export function deriveExperienceLevel(pastRaces: readonly PastRace[]): ExperienceLevel {
  return experienceFromCount(pastRaces.length);
}

/** The same ladder from a count alone — Settings re-derives from the stored rows. */
export function experienceFromCount(finished: number): ExperienceLevel {
  if (finished >= VETERAN_FROM) return 'veteran';
  if (finished >= INTERMEDIATE_FROM) return 'intermediate';
  return 'beginner';
}

const NOTE_MAX = 200;
const DAY_SECONDS = 24 * 60 * 60;

/**
 * One list entry from untrusted input, or null. A server action's payload is
 * whatever the client sent: every field is checked at runtime. Distance from
 * the closed set; a calendar date not after `today`; a finish, if given, a
 * whole number of seconds inside a day; a note, if given, ≤ 200 characters
 * (blank is none).
 */
export function parsePastRace(input: unknown, today: string): PastRace | null {
  // A primitive reads as a record with no fields — every check below refuses
  // it — so the only guard needed is against null and undefined.
  const rec = input as Record<string, unknown> | null | undefined;
  if (!rec || !isDistance(rec.distance) || !isPastDate(rec.date, today)) return null;
  const finishSeconds = parseFinish(rec.finishSeconds);
  const note = parseNote(rec.note);
  if (finishSeconds === undefined || note === undefined) return null;
  return { distance: rec.distance, date: rec.date, finishSeconds, note };
}

function isDistance(value: unknown): value is RaceDistance {
  return (RACE_DISTANCES as readonly string[]).includes(value as string);
}

/** A calendar date on or before today. */
function isPastDate(value: unknown, today: string): value is string {
  return isCalendarDate(value) && value <= today;
}

/** Null for absent; `undefined` for invalid. */
function parseFinish(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value)) return undefined;
  const seconds = value as number;
  return seconds > 0 && seconds < DAY_SECONDS ? seconds : undefined;
}

/** Null for absent or blank; `undefined` for invalid. */
function parseNote(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > NOTE_MAX) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * A finish time as the athlete types it — `h:mm` or `h:mm:ss` — as seconds;
 * null for blank (no finish given); undefined for anything unreadable.
 */
export function parseFinishInput(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const m = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(trimmed);
  if (!m) return undefined;
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
  // The same range `parsePastRace` enforces. The two disagreeing let the form
  // enable Add on a finish the server then refuses, and during onboarding one
  // such row refuses the whole answer with only the generic error to show for
  // it (CodeRabbit, PR #98).
  return seconds > 0 && seconds < DAY_SECONDS ? seconds : undefined;
}

/** The inverse: `h:mm`, or `h:mm:ss` when there are seconds. */
export function formatFinish(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}${s ? `:${String(s).padStart(2, '0')}` : ''}`;
}
