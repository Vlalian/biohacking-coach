import type { Athlete } from '@/features/athlete/athlete';
import type { Session } from '@/features/session/session';
import type { NewSessionRow } from '@/db/schema';
import { addDays } from '@/lib/date';
import { assertNoIdentity, type CheckIn, type SkippedSession, type WeekFeedbackEntry } from './check-in';
import type { CoachMessage } from './coach-client';
import type { Message } from './conversation';

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

/** The allowed session types the plan extractor may return. */
const PLAN_TYPES = ['Endurance', 'Intensity', 'Tempo', 'Recovery', 'Rest'] as const;
type PlanType = (typeof PLAN_TYPES)[number];

const DAY_INDEX: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

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
    equipment: athlete.equipment ?? undefined,
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
export function toApiMessages(transcript: Message[]): CoachMessage[] {
  return [
    { role: 'user', content: WEEKLY_OPENER },
    ...transcript.map((m): CoachMessage => ({
      role: m.role === 'coach_ai' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];
}

/** Turns a stored transcript into the "Coach:/Athlete:" text the extractor reads. */
export function transcriptToText(transcript: Message[]): string {
  return transcript
    .map((m) => `${m.role === 'coach_ai' ? 'Coach' : 'Athlete'}: ${m.content}`)
    .join('\n');
}

export interface PlanItem {
  dayOfWeek: string;
  type: PlanType;
  duration: string | null;
  zone: string | null;
  note: string | null;
}

/**
 * Parses the plan-extraction reply into plan items, tolerating the code fences a
 * model sometimes wraps JSON in. Returns null when the text is not a JSON array —
 * the caller surfaces that as "could not read the plan" rather than crashing.
 * Items with an unknown day or type are dropped, so a malformed row never becomes
 * a bad session.
 */
export function parsePlanSessions(rawText: string): PlanItem[] | null {
  const cleaned = rawText
    .trim()
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const items: PlanItem[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const dayOfWeek = typeof r.dayOfWeek === 'string' ? r.dayOfWeek : '';
    const type = typeof r.type === 'string' ? r.type : '';
    if (!(dayOfWeek in DAY_INDEX)) continue;
    if (!PLAN_TYPES.includes(type as PlanType)) continue;
    items.push({
      dayOfWeek,
      type: type as PlanType,
      duration: typeof r.duration === 'string' ? r.duration : null,
      zone: typeof r.zone === 'string' ? r.zone : null,
      note: typeof r.note === 'string' ? r.note : null,
    });
  }
  return items;
}

/** Minutes from a free-form duration string ("60 min" → 60), or null. */
export function parseDurationMinutes(duration: string | null): number | null {
  if (!duration) return null;
  const match = duration.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/**
 * Maps parsed plan items onto real dates for the target week, ready to insert.
 *
 * Rest days carry no session, so they produce no row — the calendar shows a Rest
 * day as the absence of a session. `dayOrder` follows array order within a day, so
 * a Double (two sessions on one date) keeps the order the Coach agreed.
 */
export function planToNewSessionRows(
  items: PlanItem[],
  weekStartKey: string,
  athleteId: string,
): NewSessionRow[] {
  const orderByDate = new Map<string, number>();
  const rows: NewSessionRow[] = [];
  for (const item of items) {
    if (item.type === 'Rest') continue;
    const date = addDays(weekStartKey, DAY_INDEX[item.dayOfWeek]);
    const dayOrder = orderByDate.get(date) ?? 0;
    orderByDate.set(date, dayOrder + 1);
    rows.push({
      athleteId,
      date,
      type: item.type,
      origin: 'coach',
      status: 'planned',
      duration: parseDurationMinutes(item.duration),
      zone: item.zone,
      note: item.note,
      dayOrder,
    });
  }
  return rows;
}
