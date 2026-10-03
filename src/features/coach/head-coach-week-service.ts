import { mergeAthleteProfile, getAthleteById } from '@/features/athlete/athlete-repository';
import { getDb } from '@/db';
import { events } from '@/db/schema';
import { getActiveLink } from './coach-repository';
import { draftLanded } from './week-draft-service';
import { chosenFirstDay, ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { fixedConstraintsOf, validateProposedPlan, type ProposedSession } from './weekly-session';
import { wholeWeekWindow } from './week-draft';
import { addDays } from '@/lib/date';
import type { PlanningWindow } from './planning-window';
import { getPendingWeekDraft, recordWeekDraftApproval } from './week-draft-repository';

/**
 * The Head Coach's hand on the drafted week and its day
 * (`training-architecture/17`; ADR 0003 amendment 2026-09-14).
 *
 * Two acts, both behind the same link gate every Head Coach write has:
 *
 *   - **Setting the athlete's Weekly Session Day.** While a link is active the
 *     coach owns it — they do the planning work that day governs. One field,
 *     whoever is present writes it; the value never resets on sever.
 *   - **Approving the drafted week**, as drafted or edited, before it reaches
 *     the athlete. Approval is an *event*, never a write to `sessions`: the
 *     athlete's accept (`/18`) is still the only thing that lands training on
 *     the calendar, and this module does not import the means to do otherwise.
 *
 * Both are narrated to the athlete as the coach's — the day change always, the
 * approval only when the coach changed something.
 */

export type SetDayResult = { ok: true } | { ok: false; reason: 'not-linked' | 'invalid' };

/** The seven weekdays; "Flexible" is retired (CONTEXT.md, 2026-09-14). */
const WEEKDAYS: readonly string[] = ONBOARDING_OPTIONS.days;

export async function setWeeklySessionDayAsHeadCoach(params: {
  headCoachId: string;
  athleteId: string;
  day: string;
}): Promise<SetDayResult> {
  const { headCoachId, athleteId, day } = params;
  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };
  if (!WEEKDAYS.includes(day)) return { ok: false, reason: 'invalid' };

  const athlete = await getAthleteById(athleteId);
  const from = athlete?.profile?.weeklySessionDay ?? null;
  await mergeAthleteProfile(athleteId, { weeklySessionDay: day });
  await getDb().insert(events).values({
    athleteId,
    actorType: 'head_coach',
    actorId: headCoachId,
    type: 'weekly_session_day_set',
    payload: { from, to: day },
  });
  return { ok: true };
}

export type ApproveResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'not-linked' | 'stale' | 'invalid' };

/**
 * Approves the pending draft for a week, as the coach left it.
 *
 * `draftId` must still be the pending draft — a regenerated or withdrawn one
 * is refused as `stale` rather than approved by a button that outlived it.
 * The sessions are re-validated against the draft's week the way the athlete's
 * accept will validate them; `changed` is computed here against the stored
 * draft, never trusted from the client, because it decides whether the athlete
 * is told the coach shaped their week.
 */
export async function approveWeekDraft(params: {
  headCoachId: string;
  athleteId: string;
  draftId: string;
  weekStart: string;
  sessions: unknown;
  today: string;
}): Promise<ApproveResult> {
  const { headCoachId, athleteId, draftId, weekStart, sessions, today } = params;
  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };

  // The coach-side read: no `asOf`, the preview is theirs to see.
  const pending = await getPendingWeekDraft(athleteId, weekStart);
  if (!pending || pending.id !== draftId) return { ok: false, reason: 'stale' };

  const accepted = acceptedSessions(await athleteLimits(athleteId, weekStart, today), sessions);
  if (!accepted) return { ok: false, reason: 'invalid' };
  // All or nothing. The validator drops a bad row and keeps the rest, which is
  // right for the Coach's model output and wrong for a person's edits: a coach
  // who mistyped one day would have that session vanish from the athlete's
  // week without a word. A count mismatch means a row was dropped, so the
  // whole payload is refused and the panel says so (CodeRabbit, PR #69).
  if (accepted.length !== sessionsArrayLength(sessions)) return { ok: false, reason: 'invalid' };

  // `changed` is read before the coach's prose is stripped, so a note edit
  // still counts as the coach shaping the week — that is what the athlete is
  // told, and it is true even though the words themselves go no further.
  const changed = !sameSessions(pending.sessions, accepted);
  await recordWeekDraftApproval({
    athleteId,
    headCoachId,
    draftId,
    weekStart,
    visibleFrom: pending.visibleFrom,
    sessions: withoutCoachProse(pending.sessions, accepted),
    citations: pending.citations,
    changed,
  });
  return { ok: true, changed };
}

/**
 * The window the athlete's accept (`week-draft-decision-service.ts`) will
 * validate this week against: the draft's whole week, as drafted (Mads,
 * 2026-09-15), bounded by the athlete's own limits, which are their Fixed
 * Constraints, Unavailable dates and chosen first day. Without the limits a
 * coach could approve a week the athlete then cannot accept (code-health/34
 * A1); and the whole week, not only the days from today, so a midweek approval
 * keeps the week's earlier sessions as the accept will (Mads, 2026-10-03).
 * Null once the week has ended: nothing is left to plan.
 */
async function athleteLimits(athleteId: string, weekStart: string, today: string): Promise<PlanningWindow | null> {
  if (addDays(weekStart, 6) < today) return null;
  const athlete = await getAthleteById(athleteId);
  return wholeWeekWindow(
    weekStart,
    fixedConstraintsOf({ profile: athlete?.profile ?? null }),
    await getUnavailableDates(athleteId),
    chosenFirstDay(athlete?.profile, today),
  );
}

/** The coach's sessions as the server accepts them inside that window, or null. */
function acceptedSessions(window: PlanningWindow | null, sessions: unknown): ProposedSession[] | null {
  if (!window) return null;
  // The one place a coach's own how-to is taken in (`training-architecture/26`, E6).
  const validated = validateProposedPlan({ sessions }, window, { coachHowTo: true });
  return validated.ok ? validated.sessions : null;
}

/** How many rows the coach sent, or 0 when the input was not a list — the count the validator's survivors are held to. */
function sessionsArrayLength(input: unknown): number {
  return Array.isArray(input) ? input.length : 0;
}

/**
 * The approved sessions with every note the coach wrote removed — and every
 * cue and sport reason, which are Momentum's words by the same rule and are
 * shown as Momentum's (`training-architecture/26`). The coach's own words
 * about how to do a session go in their how-to, which is shown as theirs.
 *
 *
 * **A Head Coach's note is never sent** (`prompts.ts:sessionNote`, Mads
 * 2026-08-21): it is a third party's prose about the athlete, and a name in it
 * is invisible to the identifier assertion. The approved sessions become the
 * athlete's proposal — staged into the chat's prompt on "discuss",
 * written as `origin: 'coach'` rows on "accept" — and on both routes a note
 * the coach typed would travel as if the Coach had written it, past a guard
 * that keys on origin. So it is stripped here, at the one write, rather than
 * filtered at two reads.
 *
 * A note is the Coach's only when *this* session's drafted counterpart carried
 * exactly it. The panel keeps rows in the draft's order and appends added ones
 * past the end, so the counterpart is the row at the same position; an added
 * row has none and any note on it is the coach's. Matching by position rather
 * than by text is what stops a coach from copying one session's note onto
 * another and having it survive as the Coach's words for a session the Coach
 * never wrote them for (CodeRabbit, PR #69). A moved session keeps its
 * position, so its note survives.
 */
function withoutCoachProse(drafted: ProposedSession[], accepted: ProposedSession[]): ProposedSession[] {
  return accepted.map((s, i) => momentumWordsOnly(s, drafted[i] ?? NOT_DRAFTED));
}

/** A session the coach added has no drafted counterpart, so none of its words are Momentum's. */
const NOT_DRAFTED: Partial<ProposedSession> = {};

function momentumWordsOnly(s: ProposedSession, drafted: Partial<ProposedSession>): ProposedSession {
  // One comparison each: a null note either matches a null draft note or is
  // rebuilt to the same null, so a separate null guard would be a branch no
  // test can tell apart.
  const kept = { ...s, note: s.note === drafted.note ? s.note : null };
  if (s.cue !== drafted.cue) delete kept.cue;
  if (s.sportReason !== drafted.sportReason) delete kept.sportReason;
  return kept;
}

/**
 * Field-by-field, in order — a reordered week is a changed week. The sport,
 * the cue and the coach's own how-to count too (`training-architecture/26`):
 * a coach who rewrote how a session is done shaped the week.
 */
function sameSessions(a: ProposedSession[], b: ProposedSession[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => sameSession(x, b[i]));
}

function sameSession(x: ProposedSession, y: ProposedSession): boolean {
  return (
    x.date === y.date &&
    x.type === y.type &&
    x.durationMinutes === y.durationMinutes &&
    x.zone === y.zone &&
    x.note === y.note &&
    sameHowTo(x, y)
  );
}

function sameHowTo(x: ProposedSession, y: ProposedSession): boolean {
  // The reason counts too: dropping it changes what is stored (CodeRabbit, PR #122).
  return (
    x.sport === y.sport &&
    x.sportReason === y.sportReason &&
    x.cue === y.cue &&
    JSON.stringify(x.coachHowTo) === JSON.stringify(y.coachHowTo)
  );
}

/**
 * The coach page's poll read (`training-architecture/29`): whether the
 * previewed week's draft has landed, behind the same link gate as every
 * Head Coach act — an unlinked coach is told "not yet" and nothing is read.
 */
export async function coachDraftLanded(headCoachId: string, athleteId: string, weekStart: string): Promise<boolean> {
  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return false;
  return draftLanded(athleteId, weekStart);
}
