import { mergeAthleteProfile, getAthleteById } from '@/features/athlete/athlete-repository';
import { getDb } from '@/db';
import { events } from '@/db/schema';
import { getActiveLink } from './coach-repository';
import { ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';
import { validateProposedPlan, type ProposedSession } from './weekly-session';
import { weekWindow } from './week-draft';
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

  const accepted = acceptedSessions(weekStart, today, sessions);
  if (!accepted) return { ok: false, reason: 'invalid' };

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
    sessions: withoutCoachNotes(pending.sessions, accepted),
    citations: pending.citations,
    changed,
  });
  return { ok: true, changed };
}

/**
 * The coach's sessions as the server accepts them for that week, or null — the
 * same validator the Weekly Session and the athlete's accept use, against the
 * draft's own week.
 */
function acceptedSessions(weekStart: string, today: string, sessions: unknown): ProposedSession[] | null {
  const window = weekWindow(weekStart, today);
  if (!window) return null;
  const validated = validateProposedPlan({ sessions }, window);
  return validated.ok ? validated.sessions : null;
}

/**
 * The approved sessions with every note the coach wrote removed.
 *
 * **A Head Coach's note is never sent** (`prompts.ts:sessionNote`, Mads
 * 2026-08-21): it is a third party's prose about the athlete, and a name in it
 * is invisible to the identifier assertion. The approved sessions become the
 * athlete's proposal — staged into a Weekly Session prompt on "discuss",
 * written as `origin: 'coach'` rows on "accept" — and on both routes a note
 * the coach typed would travel as if the Coach had written it, past a guard
 * that keys on origin. So it is stripped here, at the one write, rather than
 * filtered at two reads. A note is the coach's when it is not word-for-word
 * the Coach's own note for that date and slot; the Coach's notes survive,
 * even on a session the coach moved.
 */
function withoutCoachNotes(drafted: ProposedSession[], accepted: ProposedSession[]): ProposedSession[] {
  // Null is a member on purpose: a session with no note is "the Coach's" and
  // passes through, which is what lets the one condition below decide both.
  const coachWrote = new Set<string | null>([null, ...drafted.map((s) => s.note)]);
  return accepted.map((s) => (coachWrote.has(s.note) ? s : { ...s, note: null }));
}

/** Field-by-field, in order — a reordered week is a changed week. */
function sameSessions(a: ProposedSession[], b: ProposedSession[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    return (
      x.date === y.date &&
      x.type === y.type &&
      x.durationMinutes === y.durationMinutes &&
      x.zone === y.zone &&
      x.note === y.note
    );
  });
}
