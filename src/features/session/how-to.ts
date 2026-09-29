import { isFreeOfShapedIdentifiers } from '@/lib/identifiers';
import type { Locale } from '@/i18n/routing';
import {
  FUELLING_CUE,
  HOW_TO_TEMPLATES,
  type BrickForm,
  type HowToTemplate,
  type IntervalsForm,
  type MainSetForm,
  type SwimRepeatsForm,
} from './how-to-templates';

/**
 * A session's how-to (`training-architecture/26`): what to do, in order, and
 * what to attend to. Built by code from the reviewed templates in
 * `how-to-templates.ts` (Mads's ruling E5, 2026-09-29), plus at most one
 * personal cue from Momentum, and replaced whole by a Head Coach's own text
 * when they edit it (E6: the coach's text is final).
 *
 * **Computed at render, never stored.** Only the two things a person or
 * Momentum wrote are kept on the row (`sessions.how_to`): Momentum's cue and
 * the coach's edited how-to. Everything else is a pure function of the
 * session's type, sport, minutes and zone, so a coach who changes only the
 * duration or the zone gets a fitted how-to for free, a moved session keeps
 * its own, and a change to one session refits that session and no other.
 *
 * Pure: no clock, no database, no Coach call. The Session Drawer and the Head
 * Coach's review both import it.
 */

/** The zones a segment may carry: the %HRmax language, Z1–Z5 (§09). */
export const ZONES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;
export type Zone = (typeof ZONES)[number];

export const SEGMENT_NAMES = ['warmUp', 'steady', 'main', 'coolDown'] as const;
export type SegmentName = (typeof SEGMENT_NAMES)[number];

/** One part of a session: its minutes, its zone, and what to do in it when that is more than the zone. */
export interface HowToSegment {
  name: SegmentName;
  minutes: number;
  zone: Zone;
  /** The set in words ("6 × 3 min, 2 min Z1 between"), or null for a steady block. */
  detail: string | null;
}

export interface HowTo {
  segments: HowToSegment[];
  focus: string[];
}

/** What `sessions.how_to` holds: only what someone wrote, never the computed part. */
export interface StoredHowTo {
  /** Momentum's one personal cue, set when it drafted the session. */
  cue?: string;
  /** The Head Coach's own how-to. Present means final: nothing refits it. */
  coach?: HowTo;
}

/** A how-to as a surface shows it. */
export interface HowToView extends HowTo {
  /** Momentum's cue, shown as Momentum's; null when there is none or the coach's text replaced it. */
  cue: string | null;
  /** Whether this is the Head Coach's own text rather than the fitted template. */
  byCoach: boolean;
}

/** The fields of a session the how-to is fitted from. */
export interface HowToInput {
  type: string;
  sport: string | null;
  durationMinutes: number | null;
  zone: string | null;
}

/** The fields of a stored session {@link howToOf} reads. `Session` satisfies it. */
export interface PlannedForHowTo {
  origin: string;
  type: string;
  sport: string | null;
  duration: number | null;
  zone: string | null;
  howTo: StoredHowTo | null;
}

/** Each type's zone when the session names none this can use (`block-sessions.ts`, plan 34 D9). */
const TYPE_ZONE: Record<string, Zone> = { Endurance: 'Z2', Tempo: 'Z3', Intensity: 'Z4', Recovery: 'Z1' };

/** §07: warm up and cool down flat in Z2. */
const EASY_ZONE: Zone = 'Z2';
/** §07: the rest between reps is active, in Z1. */
const REST_ZONE: Zone = 'Z1';
/** Under this, a session is one block: a warm-up and cool-down would leave no main part worth the name. */
const SHORTEST_SPLIT = 20;
/** §07: an hour or more asks for fuelling practice (corpus #5–#7). */
const FUELLING_OVER = 60;

/** §07 swim warm-up and cool-down, in metres: the corpus's most uniform number. */
const SWIM_WARM_UP = '150–250 m';
const SWIM_COOL_DOWN = '~100 m';

/** Only these origins are drafted by the structure or by Momentum (ruling 6: no how-to for the rest). */
const HOW_TO_ORIGINS: readonly string[] = ['arithmetic', 'coach'];

/**
 * The session's how-to as a surface shows it, or null for a session that has
 * none: one the athlete or the Head Coach created, imported history, or a
 * session with no minutes to fit.
 */
export function howToOf(session: PlannedForHowTo, locale: Locale): HowToView | null {
  if (!HOW_TO_ORIGINS.includes(session.origin)) return null;
  const stored = session.howTo ?? {};
  if (stored.coach) return { ...stored.coach, cue: null, byCoach: true };
  return fittedView(session, stored.cue ?? null, locale);
}

function fittedView(session: PlannedForHowTo, cue: string | null, locale: Locale): HowToView | null {
  const fitted = howToFor(
    { type: session.type, sport: session.sport, durationMinutes: session.duration, zone: session.zone },
    locale,
  );
  return fitted && { ...fitted, cue, byCoach: false };
}

/**
 * The template for this session's type and sport, fitted to its minutes and
 * zone. Null without minutes, or for a type no template covers.
 */
export function howToFor(session: HowToInput, locale: Locale): HowTo | null {
  const template = templateFor(session.type, session.sport);
  if (!template || session.durationMinutes === null) return null;
  const minutes = session.durationMinutes;
  const zone = mainZone(session.type, session.zone);
  return {
    segments: segmentsOf(template.main, minutes, zone, session.sport === 'swim', locale),
    focus: focusOf(template, minutes, locale),
  };
}

function templateFor(type: string, sport: string | null): HowToTemplate | undefined {
  const ofType = HOW_TO_TEMPLATES.filter((t) => t.type === type);
  return ofType.find((t) => t.sport === sport) ?? ofType.find((t) => t.sport === 'any');
}

function mainZone(type: string, zone: string | null): Zone {
  return isZone(zone) ? zone : TYPE_ZONE[type];
}

function isZone(value: unknown): value is Zone {
  return (ZONES as readonly unknown[]).includes(value);
}

/** The lower of two zones: a warm-up is never harder than the session it opens. */
function easier(a: Zone, b: Zone): Zone {
  return ZONES[Math.min(ZONES.indexOf(a), ZONES.indexOf(b))];
}

function segmentsOf(form: MainSetForm | null, minutes: number, zone: Zone, swim: boolean, locale: Locale): HowToSegment[] {
  if (minutes < SHORTEST_SPLIT) return [segment('main', minutes, zone, null)];
  const warm = warmUpMinutes(minutes);
  // §07: the cool-down is always shorter than the warm-up.
  const cool = warm === 5 ? 3 : 5;
  const easy = easier(EASY_ZONE, zone);
  return [
    segment('warmUp', warm, easy, swim ? SWIM_WARM_UP : null),
    ...mainSegments(form, minutes - warm - cool, zone, easy, locale),
    segment('coolDown', cool, easy, swim ? SWIM_COOL_DOWN : null),
  ];
}

/**
 * §07: MyProCoach warms up 5–15 min (Beginner 5–10, Advanced ~15) and 220
 * 5–8. The longer the session, the more of that range it spends.
 */
function warmUpMinutes(minutes: number): number {
  if (minutes < 45) return 5;
  return minutes < 90 ? 10 : 15;
}

function segment(name: SegmentName, minutes: number, zone: Zone, detail: string | null): HowToSegment {
  return { name, minutes, zone, detail };
}

/** The set's shape once fitted: how many reps, the time it takes, and how it reads. */
interface FittedSet {
  seconds: number;
  detail: string;
}

/**
 * The main part: the set, with whatever time the set does not fill spent
 * steady at the easy zone before it. A set whose fewest reps do not fit is
 * one block at the zone instead.
 */
function mainSegments(form: MainSetForm | null, minutes: number, zone: Zone, easy: Zone, locale: Locale): HowToSegment[] {
  const set = fittedSet(form, minutes, locale);
  if (!set) return [segment('main', minutes, zone, null)];
  const setMinutes = Math.ceil(set.seconds / 60);
  const steady = minutes - setMinutes;
  const main = segment('main', setMinutes, zone, set.detail);
  return steady > 0 ? [segment('steady', steady, easy, null), main] : [main];
}

function fittedSet(form: MainSetForm | null, minutes: number, locale: Locale): FittedSet | null {
  if (!form) return null;
  if ('workMinutes' in form) return intervals(form, minutes, locale);
  if ('bikeMinutes' in form) return brick(form, minutes, locale);
  return swimRepeats(form, minutes, locale);
}

/**
 * How many reps of `unit` seconds, each but the last followed by `gap`
 * seconds, fit in `seconds` — capped at the range's top, or null under its
 * bottom.
 */
function repsFitting(seconds: number, unit: number, gap: number, range: { min: number; max: number }): number | null {
  const reps = Math.min(Math.floor((seconds + gap) / (unit + gap)), range.max);
  return reps < range.min ? null : reps;
}

function intervals(form: IntervalsForm, minutes: number, locale: Locale): FittedSet | null {
  const work = form.workMinutes * 60;
  const rest = form.rest(work);
  const reps = repsFitting(minutes * 60, work, rest.seconds, form.reps);
  if (reps === null) return null;
  const [between, full] = locale === 'da' ? ['imellem', ' (fuld restitution)'] : ['between', ' (full recovery)'];
  return {
    seconds: reps * work + (reps - 1) * rest.seconds,
    detail: `${reps} × ${form.workMinutes} min, ${duration(rest.seconds)} ${REST_ZONE} ${between}${rest.fullRecovery ? full : ''}`,
  };
}

/** A brick rep is bike then run; every leg but the last is followed by a transition (§08). */
function brick(form: BrickForm, minutes: number, locale: Locale): FittedSet | null {
  const t = form.transitionSeconds;
  const legs = (form.bikeMinutes + form.runMinutes) * 60;
  const reps = repsFitting(minutes * 60, legs + t, t, form.reps);
  if (reps === null) return null;
  const [bike, run, change] = locale === 'da' ? ['cykel', 'løb', 'skift'] : ['bike', 'run', 'transition'];
  return {
    seconds: reps * legs + (2 * reps - 1) * t,
    detail: `${reps} × (${form.bikeMinutes} min ${bike} + ${form.runMinutes} min ${run}), ${duration(t)} ${change}`,
  };
}

/** The whole main part, repeated to the clock: no source gives the pace that would turn metres into a count. */
function swimRepeats(form: SwimRepeatsForm, minutes: number, locale: Locale): FittedSet {
  const range = `${form.reps.min}–${form.reps.max}`;
  const rest = duration(form.restSeconds);
  return {
    seconds: minutes * 60,
    detail:
      locale === 'da'
        ? `${form.metres} m, ${rest} pause, gentaget til tiden er gået (${range} gange)`
        : `${form.metres} m, ${rest} rest, repeated until the time is up (${range} reps)`,
  };
}

/** Whole minutes as minutes, anything else as seconds. */
function duration(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
}

function focusOf(template: HowToTemplate, minutes: number, locale: Locale): string[] {
  const cues = template.focus.map((cue) => cue[locale]);
  return template.fuelling && minutes > FUELLING_OVER ? [...cues, FUELLING_CUE[locale]] : cues;
}

// ── Validating what a person or Momentum wrote ────────────────────────────────

/** Momentum's cue: one short sentence (plan E5). */
const MAX_CUE = 140;
/** A coach's line: a cue or a segment's detail. */
const MAX_COACH_LINE = 200;
const MAX_COACH_CUES = 5;

/** A sentence end followed by more text: a second sentence. */
const SECOND_SENTENCE = /[.!?]\s+\S/;

/**
 * Momentum's one personal cue, or null: one sentence of at most 140
 * characters, with no shape-detectable identifier (E7). A cue that fails is
 * dropped; the session it rode on is kept.
 */
export function cueFrom(value: unknown): string | null {
  const cue = typeof value === 'string' ? value.trim() : '';
  return isCue(cue) ? cue : null;
}

function isCue(cue: string): boolean {
  return (
    cue !== '' && cue.length <= MAX_CUE && !cue.includes('\n') && !SECOND_SENTENCE.test(cue) && isFreeOfShapedIdentifiers(cue)
  );
}

/**
 * A Head Coach's edited how-to, or null: segments whose minutes add up to the
 * session's, each with a known name and zone, and at most five cues. Its text
 * is checked for identifiers because an approved draft is staged into Coach
 * Chat's prompt, where the boundary assertion would refuse the whole turn.
 */
export function coachHowToFrom(value: unknown, durationMinutes: number | null): HowTo | null {
  const howTo = howToShapeFrom(value);
  if (!howTo) return null;
  const total = howTo.segments.reduce((t, x) => t + x.minutes, 0);
  return total === durationMinutes ? howTo : null;
}

/**
 * The stored column, read back: each part only when it is valid. The coach's
 * how-to is not held to the session's minutes here — the coach's text is final,
 * and a later duration change must not make it vanish.
 */
export function storedHowToFrom(value: unknown): StoredHowTo | null {
  const raw = fieldsOf(value);
  const parts = Object.entries({ cue: cueFrom(raw.cue), coach: howToShapeFrom(raw.coach) }).filter(([, v]) => v !== null);
  return parts.length === 0 ? null : (Object.fromEntries(parts) as StoredHowTo);
}

/**
 * An untrusted value's fields. A primitive has none worth reading and yields
 * `undefined` for every one, which each reader already refuses; only null and
 * undefined need replacing, since reading a field off them throws.
 */
function fieldsOf(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function howToShapeFrom(value: unknown): HowTo | null {
  const raw = fieldsOf(value);
  const segments = listOf(raw.segments, segmentFrom);
  const focus = listOf(raw.focus, lineFrom);
  if (!segments?.length || !focus) return null;
  return { segments, focus: focus.filter((x): x is string => x !== null).slice(0, MAX_COACH_CUES) };
}

/** Every item as `read` keeps it, or null when the value is not a list or any item cannot be kept. */
function listOf<T>(value: unknown, read: (item: unknown) => T | undefined): T[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(read);
  return items.includes(undefined) ? null : (items as T[]);
}

function segmentFrom(value: unknown): HowToSegment | undefined {
  const raw = fieldsOf(value);
  const detail = lineFrom(raw.detail ?? null);
  return isSegmentShape(raw) && detail !== undefined ? segment(raw.name, raw.minutes, raw.zone, detail) : undefined;
}

function isSegmentShape(raw: Record<string, unknown>): raw is { name: SegmentName; minutes: number; zone: Zone } {
  return (SEGMENT_NAMES as readonly unknown[]).includes(raw.name) && isZone(raw.zone) && isWholeMinutes(raw.minutes);
}

function isWholeMinutes(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

/** A line of the coach's: trimmed, null when blank, undefined when it cannot be kept. */
function lineFrom(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const line = value.trim();
  if (line === '') return null;
  return line.length <= MAX_COACH_LINE && isFreeOfShapedIdentifiers(line) ? line : undefined;
}
