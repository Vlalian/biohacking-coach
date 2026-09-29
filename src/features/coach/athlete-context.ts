import type { Athlete } from '@/features/athlete/athlete';
import { getAthleteById } from '@/features/athlete/athlete-repository';
import type { EquipmentItem } from '@/features/equipment/equipment';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import {
  getBriefingReflections,
  getSessionsForWeek,
  getSessionsInRange,
} from '@/features/session/session-repository';
import type { Session } from '@/features/session/session';
import { capacityFor } from '@/features/health/health-repository';
import { getRaces } from '@/features/race/race-repository';
import type { RaceRow } from '@/db/schema';
import { getLanguageForAthlete } from '@/features/user-prefs/user-prefs-repository';
import { addDays, weekStartOf } from '@/lib/date';
import { getCheckInForWeek } from './check-in-repository';
import { getPresenceStage } from './presence-repository';
import { getResolvedBlocks } from './training-block-service';
import { getSharedTranscripts } from './coach-repository';
import type { CoachingLink } from './coach';
import type { PresenceStage } from './presence';
import { notableSignalFrom, readinessFrom, type CheckIn } from './check-in';
import { buildWeeklyCheckIn, fourWeekSummary, RECENT_WEEKS, weekFeedbackFrom, type WeekSummary } from './weekly-session';
import type { WeekFeedbackEntry } from './check-in';
import { briefingRaces, toBriefingReflection, type BriefingReports, type BriefingTranscript } from './briefing';

/**
 * One athlete context, read once and shaped three ways
 * (`training-architecture/52`).
 *
 * The week draft, Coach Chat and the Coach Briefing each used to assemble
 * their own copy of the same signals — equipment, blocks, the Check-in,
 * capacity, races, presence, unavailable dates, the week's sessions — and the
 * copies drifted: equipment reached chat and not the draft, and none of the
 * three read what the others did not. Now {@link readAthleteContext} does the
 * one round of reads, and a pure slice per purpose ({@link draftContextOf},
 * {@link chatContextOf}, {@link briefingContextOf}) shapes it for its prompt.
 *
 * **What is not included is never fetched.** The Briefing's rule — withheld
 * data is not fetched-then-hidden — holds here by construction: each signal is
 * read only when its flag in {@link ContextInclude} is set, and the Briefing
 * sets the reports flags from Link Visibility ({@link briefingInclude}). The
 * same gated-read-then-pure-build shape `readReports` had.
 */

/** The signals, each read by its own repository call. */
export type ContextSignal =
  | 'profile'
  | 'language'
  | 'equipment'
  | 'checkIn'
  | 'body'
  | 'races'
  | 'presence'
  | 'unavailable'
  | 'week'
  | 'reflections';

/**
 * Which signals to read. A signal left out is not fetched. `historyBefore` is
 * the week the recent history counts back from (the drafted week, for the
 * draft); absent reads no history. `link` is the Coaching Link whose shared
 * transcripts a Briefing may read; `getSharedTranscripts` checks its flag.
 */
export interface ContextInclude {
  signals: readonly ContextSignal[];
  historyBefore?: string;
  link?: CoachingLink;
}

/** The athlete as the prompts read them. `null` or empty is "not read" or "none". */
export interface AthleteContext {
  athlete: Athlete | null;
  language: string | null;
  /** The Training Blocks and the Target Race — every purpose reads them. */
  horizon: Awaited<ReturnType<typeof getResolvedBlocks>>;
  equipment: EquipmentItem[];
  checkInRow: Awaited<ReturnType<typeof getCheckInForWeek>>;
  capacity: string | null;
  races: RaceRow[];
  presenceStage: PresenceStage | null;
  unavailableDates: string[];
  /** This week's sessions, Monday to Sunday. */
  weekSessions: Session[];
  /** The four weeks before `historyBefore`. */
  pastSessions: Session[];
  /** The Briefing's Session Reflections — read only under `shareAthleteReports`. */
  reflections: Awaited<ReturnType<typeof getBriefingReflections>> | null;
  /** The shared transcripts — null when the link withholds them. */
  transcripts: Awaited<ReturnType<typeof getSharedTranscripts>>;
}

/** The draft's signals: everything it plans from except the unavailable dates, which its gate already read. */
export function draftInclude(draftedWeek: string): ContextInclude {
  return {
    signals: ['profile', 'language', 'equipment', 'checkIn', 'body', 'races', 'presence', 'week'],
    historyBefore: draftedWeek,
  };
}

/** Coach Chat's signals. The athlete row and language arrive from the signed-in action. */
export const CHAT_INCLUDE: ContextInclude = {
  signals: ['equipment', 'checkIn', 'body', 'races', 'presence', 'unavailable', 'week'],
};

/**
 * The Briefing's signals: the athlete's reports — profile, capacity, races,
 * reflections — only when Link Visibility shares them. The blocks are read
 * for every purpose (plan structure, visible like the calendar, ADR 0003).
 */
const REPORT_SIGNALS: readonly ContextSignal[] = ['profile', 'body', 'races', 'reflections'];

export function briefingInclude(link: CoachingLink, sharesReports: boolean): ContextInclude {
  return { signals: REPORT_SIGNALS.filter(() => sharesReports), link };
}

/** One read, or its "not read" value when the signal is not included. */
function when<T, E>(included: boolean, read: () => Promise<T>, absent: E): Promise<T | E> {
  return included ? read() : Promise.resolve(absent);
}

/** The four weeks of sessions before `week`, or none when no week is named. */
function historyBefore(athleteId: string, week: string | undefined): Promise<Session[]> {
  if (!week) return Promise.resolve([]);
  return getSessionsInRange(athleteId, addDays(week, -7 * RECENT_WEEKS), week);
}

/** Every included signal, in one round of reads. */
export async function readAthleteContext(
  athleteId: string,
  today: string,
  include: ContextInclude,
): Promise<AthleteContext> {
  const has = (signal: ContextSignal) => include.signals.includes(signal);
  const thisWeek = weekStartOf(today);
  const [
    athlete,
    language,
    horizon,
    equipment,
    checkInRow,
    capacity,
    races,
    presenceStage,
    unavailableDates,
    weekSessions,
    pastSessions,
    reflections,
    transcripts,
  ] = await Promise.all([
    when(has('profile'), () => getAthleteById(athleteId), null),
    when(has('language'), () => getLanguageForAthlete(athleteId), null),
    getResolvedBlocks(athleteId, today),
    when(has('equipment'), () => getEquipmentItems(athleteId), []),
    when(has('checkIn'), () => getCheckInForWeek(athleteId, thisWeek), null),
    // The capacity half only; the detail thread has no reader here (ADR 0011).
    when(has('body'), () => capacityFor(athleteId), null),
    when(has('races'), () => getRaces(athleteId), []),
    when(has('presence'), () => getPresenceStage(athleteId), null),
    when(has('unavailable'), () => getUnavailableDates(athleteId), []),
    when(has('week'), () => getSessionsForWeek(athleteId, thisWeek), []),
    historyBefore(athleteId, include.historyBefore),
    when(has('reflections'), () => getBriefingReflections(athleteId), null),
    include.link ? getSharedTranscripts(include.link) : Promise.resolve(null),
  ]);
  return {
    athlete: athlete ?? null,
    language,
    horizon,
    equipment,
    checkInRow,
    capacity,
    races,
    presenceStage,
    unavailableDates,
    weekSessions,
    pastSessions,
    reflections,
    transcripts,
  };
}

/**
 * The Check-in every planning prompt reads, from the context. The athlete is
 * passed in because Coach Chat has it from the signed-in action and the draft
 * from the context.
 */
function checkInOf(
  ctx: AthleteContext,
  athlete: Athlete,
  today: string,
  language: string | undefined,
  planWrittenAt: Date | null,
): CheckIn {
  const race = ctx.horizon.race;
  return buildWeeklyCheckIn(
    athlete,
    today,
    readinessFrom(ctx.checkInRow),
    ctx.presenceStage ?? 'cold_start',
    language,
    ctx.equipment,
    race ? { name: race.name, date: race.date } : null,
    ctx.capacity,
    notableSignalFrom(ctx.checkInRow),
    ctx.races,
    planWrittenAt,
    ctx.horizon.blocks,
  );
}

/** What the draft prompt reads from the context. */
export interface DraftSlice {
  checkIn: CheckIn;
  weekFeedback: WeekFeedbackEntry[];
  recentWeeks: WeekSummary[];
}

/** The draft's slice: the Check-in, this week's reflections and the four weeks before the drafted one. */
export function draftContextOf(
  ctx: AthleteContext,
  athlete: Athlete,
  opts: { today: string; draftedWeek: string },
): DraftSlice {
  return {
    checkIn: checkInOf(ctx, athlete, opts.today, ctx.language ?? undefined, null),
    weekFeedback: weekFeedbackFrom(ctx.weekSessions),
    recentWeeks: fourWeekSummary(ctx.pastSessions, opts.draftedWeek, opts.today),
  };
}

/** What Coach Chat's prompt reads from the context. */
export interface ChatSlice {
  checkIn: CheckIn;
  weekSessions: Session[];
}

/** Coach Chat's slice: the Check-in (with when this week's plan was written) and the week. */
export function chatContextOf(
  ctx: AthleteContext,
  athlete: Athlete,
  opts: { today: string; language?: string; planWrittenAt: Date | null },
): ChatSlice {
  return {
    checkIn: checkInOf(ctx, athlete, opts.today, opts.language, opts.planWrittenAt),
    weekSessions: ctx.weekSessions,
  };
}

/** The Briefing's gated material: the reports and the transcripts, each null when withheld. */
export interface BriefingSlice {
  reports: BriefingReports | null;
  transcripts: BriefingTranscript[] | null;
}

/**
 * The Briefing's slice. `phase` arrives resolved: the Training Phase is the
 * name of the Training Block today falls inside, and null for an athlete with
 * no race, which the briefing renders as no phase.
 */
export function briefingContextOf(ctx: AthleteContext, opts: { today: string; phase: string | null }): BriefingSlice {
  return {
    reports: ctx.reflections ? reportsOf(ctx, ctx.reflections, opts) : null,
    transcripts: ctx.transcripts
      ? ctx.transcripts.map((c) => ({
          kind: c.kind,
          lines: c.messages.map((m) => `${roleLabel(m.role)}: ${m.content}`),
        }))
      : null,
  };
}

function reportsOf(
  ctx: AthleteContext,
  reflections: NonNullable<AthleteContext['reflections']>,
  opts: { today: string; phase: string | null },
): BriefingReports {
  // A missing athlete row reads as an athlete who has said nothing: every
  // column is nullable already, so the empty row is the honest stand-in.
  // Stryker disable next-line ObjectLiteral: equivalent. Every profile field is
  // rendered by presence, so an empty stand-in and an all-null one produce the
  // same briefing; the explicit nulls are for the type, not the behaviour.
  const a = ctx.athlete ?? { experienceLevel: null, raceTarget: null, trainingSessionsPerWeek: null, profile: null };
  return {
    profile: {
      phase: opts.phase,
      experienceLevel: a.experienceLevel,
      raceTarget: a.raceTarget,
      sessionsPerWeek: a.trainingSessionsPerWeek,
      onboarding: a.profile?.onboarding ?? null,
      // The capacity half only. A Head Coach reads the detail thread on the
      // athlete's own page, not through a briefing that is assembled into a
      // model prompt (ADR 0011).
      capacity: ctx.capacity,
      ...briefingRaces(ctx.races, opts.today),
    },
    reflections: reflections.map(toBriefingReflection),
  };
}

function roleLabel(role: 'athlete' | 'coach_ai' | 'head_coach'): string {
  if (role === 'athlete') return 'Athlete';
  if (role === 'head_coach') return 'Coach';
  return 'Momentum';
}
