import type { Athlete } from '@/features/athlete/athlete';
import type { EquipmentItem } from '@/features/equipment/equipment';
import type { Session } from '@/features/session/session';
import type { NewSessionRow } from '@/db/schema';
import { isValidDateKey } from '@/lib/date';
import { assertNoIdentity, type CheckIn, type SkippedSession, type WeekFeedbackEntry } from './check-in';
import type { CoachMessage } from './coach-client';
import { toApiMessages, type Message } from './conversation';

/**
 * The Weekly Session's pure orchestration logic — the deterministic seam between
 * the app's data and the Coach's prompts. Everything here is plain data in, plain
 * data out: no DB, no HTTP, no Anthropic client. The server action wires these to
 * the repository and the adapter.
 *
 * The load-bearing rule of ADR 0006 / GDPR decision 1 lives here: {@link
 * buildWeeklyCheckIn} assembles a check-in from the opaque athlete profile and
 * never touches a name or an email, so no direct identifier can reach a prompt.
 */

/** The readiness the athlete reports at the start of a Weekly Session. */
export interface Readiness {
  body: number;
  mental: number;
  energy: number;
  sleep: number;
  pulse: number;
}

/** The user-turn primer that opens a Weekly Session (never persisted). */
export const WEEKLY_OPENER = "Let's do our weekly session.";

/**
 * Assembles the check-in the Weekly Session prompt reasons about, from the
 * athlete's opaque profile and today's reported readiness.
 *
 * No name, email, DOB or location is read here — only the opaque profile columns
 * and the onboarding answers. `personaName` is deliberately left unset: the
 * prompt never carries a real identity (GDPR decision 1). The result is passed
 * through {@link assertNoIdentity}, so the guarantee is enforced, not merely
 * intended.
 *
 * `language` arrives as a parameter because it lives on the user (`ui_prefs`,
 * ticket 09), not in training data — the caller reads it through the user seam.
 * Defaults to English until onboarding sets it.
 */
export function buildWeeklyCheckIn(
  athlete: Athlete,
  readiness: Readiness,
  weeklySessionNumber: number,
  language?: string,
  equipmentItems: EquipmentItem[] = [],
): CheckIn {
  const checkIn: CheckIn = {
    body: readiness.body,
    mental: readiness.mental,
    energy: readiness.energy,
    sleep: readiness.sleep,
    pulse: readiness.pulse,
    phase: athlete.trainingPhase ?? undefined,
    experienceLevel: athlete.experienceLevel ?? undefined,
    commStyle: athlete.communicationStyle ?? undefined,
    raceTarget: athlete.raceTarget ?? undefined,
    // The STATE line's `sessions=` is coaching-relationship depth — how many
    // Weekly Sessions have come before, not the athlete's weekly frequency.
    // Mapping `trainingSessionsPerWeek` here would mislabel a cadence (6/week)
    // as history (6 sessions had), so relationship depth is used instead.
    sessionCount: Math.max(0, weeklySessionNumber - 1),
    language: language ?? 'en',
    onboarding: athlete.profile?.onboarding ?? undefined,
    // Equipment lives in its own table (its own screen, its own CRUD), not on
    // the athlete row — the caller fetches it and passes it in.
    equipment: equipmentItems,
    // The constraint answers from MCQ onboarding (slice 09): no-training days
    // and the preferred Weekly Session day, both read by the weekly prompt.
    fixedConstraints: athlete.profile?.fixedConstraints ?? undefined,
    weeklySessionDay: athlete.profile?.weeklySessionDay ?? undefined,
    weeklySessionNumber,
  };
  assertNoIdentity(checkIn);
  return checkIn;
}

/**
 * A Session Reflection is two 1–5 smiley scores; the weekly feedback summary
 * speaks in tenths. Maps 1→1 and 5→10 linearly so the Coach reads one consistent
 * scale.
 */
export function reflectionScoreToTen(v: number): number {
  return Math.round(1 + ((v - 1) * 9) / 4);
}

/**
 * The week's Session Reflections as the Coach's feedback summary. Reads only
 * rated sessions — an unrated session contributes nothing — so this is exactly
 * "the Coach reads the athlete's Session Reflections when reviewing".
 */
export function weekFeedbackFrom(sessions: Session[]): WeekFeedbackEntry[] {
  return sessions
    .filter((s) => s.feedbackBody !== null && s.feedbackMind !== null)
    .map((s) => ({
      dateKey: s.date,
      sessionType: s.type,
      body: reflectionScoreToTen(s.feedbackBody as number),
      mind: reflectionScoreToTen(s.feedbackMind as number),
      comment: s.feedbackComment,
    }));
}

/** The week's skipped sessions as natural date + type references (no ids). */
export function skippedFrom(sessions: Session[]): SkippedSession[] {
  return sessions
    .filter((s) => s.status === 'skipped')
    .map((s) => ({ date: s.date, sessionType: s.type }));
}

/**
 * Renders a stored transcript into the alternating user/assistant history the
 * Anthropic API expects. The Coach speaks first in a Weekly Session, so a fixed
 * user-turn primer opens the history; it is a prompt device, never persisted.
 */
export function toWeeklyApiMessages(transcript: Message[]): CoachMessage[] {
  return toApiMessages(transcript, WEEKLY_OPENER);
}

// ── The Week Plan proposal tool ───────────────────────────────────────────────

/**
 * The session types the Coach may propose. A rest day carries no session — the
 * calendar shows it as the absence of one — so 'Rest' is deliberately not a
 * value the tool can emit.
 */
export const PLAN_TYPES = ['Endurance', 'Intensity', 'Tempo', 'Recovery'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** One session the Coach proposes — a real date, not a weekday name. */
export interface ProposedSession {
  date: string;
  type: PlanType;
  durationMinutes: number | null;
  zone: string | null;
  note: string | null;
}

export const PROPOSE_WEEK_PLAN_TOOL_NAME = 'propose_week_plan';

/**
 * The tool the Coach calls to *propose* a training week — it never writes. A tool
 * call stages a proposal the athlete then confirms or cancels; the server is the
 * authority on what actually lands (ADR 0006). Dates are explicit, so a plan may
 * span any range the Coach and athlete agreed — including from today into the
 * following week, which a weekday-only shape could not express. `strict` makes
 * the API guarantee the input matches this schema, so there is no JSON parsing or
 * fence-stripping to get wrong.
 */
export const PROPOSE_WEEK_PLAN_TOOL = {
  name: PROPOSE_WEEK_PLAN_TOOL_NAME,
  description:
    'Propose the agreed training week to the athlete for confirmation. This does ' +
    'NOT save anything — it shows the plan to the athlete, who confirms or cancels. ' +
    'Call it only once the athlete has agreed to the plan, never while you are ' +
    'still offering options. Give every session an explicit calendar date; omit ' +
    'rest days entirely. The plan may cover any range you agreed, including from ' +
    'today into next week.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sessions: {
        type: 'array',
        description: 'The training sessions of the week, in day order. No rest days.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            date: { type: 'string', description: 'Calendar date, YYYY-MM-DD.' },
            type: { type: 'string', enum: [...PLAN_TYPES] },
            durationMinutes: { type: 'integer', description: 'Planned duration in minutes.' },
            zone: { type: 'string', description: 'Intensity zone, e.g. Z2.' },
            note: { type: 'string', description: 'One short coaching line.' },
          },
          required: ['date', 'type', 'durationMinutes', 'zone', 'note'],
        },
      },
    },
    required: ['sessions'],
  },
} as const;

const MAX_SESSION_MINUTES = 24 * 60;

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function positiveMinutes(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_SESSION_MINUTES
    ? value
    : null;
}

export type ValidatePlanResult =
  | { ok: true; sessions: ProposedSession[] }
  | { ok: false; reason: 'malformed' | 'empty' };

/**
 * The server-authority gate over a proposed plan.
 *
 * `strict` tool use guarantees the shape, but not the meaning: the Coach could
 * still name an impossible date (2026-02-30) or one in the past. Each row is
 * checked against the real calendar and today; a row that fails is dropped rather
 * than trusted. `malformed` means the input was not even a sessions array;
 * `empty` means nothing valid survived — both are refusals, so nothing is staged.
 * The athlete only ever sees, and confirms, rows that passed here.
 */
export function validateProposedPlan(input: unknown, today: string): ValidatePlanResult {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'malformed' };
  const raw = (input as Record<string, unknown>).sessions;
  if (!Array.isArray(raw)) return { ok: false, reason: 'malformed' };

  const sessions: ProposedSession[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const s = entry as Record<string, unknown>;
    const date = typeof s.date === 'string' ? s.date : '';
    const type = typeof s.type === 'string' ? s.type : '';
    // A real calendar day, today or later — a past day is history, not a plan.
    if (!isValidDateKey(date) || date < today) continue;
    if (!PLAN_TYPES.includes(type as PlanType)) continue;
    sessions.push({
      date,
      type: type as PlanType,
      durationMinutes: positiveMinutes(s.durationMinutes),
      zone: optionalString(s.zone),
      note: optionalString(s.note),
    });
  }

  if (sessions.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, sessions };
}

/** The [start, end] calendar span a proposal covers — the range to replace. */
export function proposalDateRange(sessions: ProposedSession[]): {
  start: string;
  end: string;
} {
  const dates = sessions.map((s) => s.date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

/**
 * Maps validated proposed sessions to insertable rows.
 *
 * `dayOrder` follows array order within a single date, so a Double (two sessions
 * on one day) keeps the order the Coach agreed. Every row is `origin: 'coach'`
 * and `status: 'planned'`, so the write only ever replaces coach-planned days.
 */
export function proposedToNewSessionRows(
  sessions: ProposedSession[],
  athleteId: string,
): NewSessionRow[] {
  const orderByDate = new Map<string, number>();
  return sessions.map((s) => {
    const dayOrder = orderByDate.get(s.date) ?? 0;
    orderByDate.set(s.date, dayOrder + 1);
    return {
      athleteId,
      date: s.date,
      type: s.type,
      origin: 'coach',
      status: 'planned',
      duration: s.durationMinutes,
      zone: s.zone,
      note: s.note,
      dayOrder,
    };
  });
}
