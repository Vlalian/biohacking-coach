import { getDb } from '@/db';
import { asc, eq } from 'drizzle-orm';
import { sessions } from '@/db/schema';
import { toSession, type Session } from '@/features/session/session';
import { buildDataset } from '@/features/information-view/build-dataset';
import type { InfoDataset } from '@/features/information-view/dataset';
import { getInformationViewInputs } from '@/features/information-view/information-view-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import {
  getActiveLink,
  getAthleteName,
  getSharedTranscripts,
  UNKNOWN_ATHLETE,
  type SharedTranscript,
} from './coach-repository';
import { canHeadCoachEditContent } from './head-coach-authority';
import type { LinkVisibility } from './link-visibility';
import {
  applyVisibilityToInputs,
  applyVisibilityToSessions,
} from './link-visibility';

/**
 * A plan session as the Head Coach's editing surface sees it — the fields a
 * prescription form reads and writes, plus `origin`/`status` so the UI knows
 * which sessions are the Head Coach's to edit. Distinct from the calendar's
 * `Session` because it deliberately carries `origin` (the calendar never needs
 * it) and never the athlete's reflection (editing is about the plan, not the
 * reports the visibility flag governs).
 */
export type PlanSession = {
  id: string;
  date: string;
  type: string;
  status: string;
  origin: string;
  duration: number | null;
  zone: string | null;
  title: string | null;
  note: string | null;
  /** Whether the Head Coach may edit/delete this one (guard on origin). */
  editable: boolean;
  /** The version this view was read at, sent back with an edit or delete so a
   *  change the athlete made in between is refused rather than overwritten. */
  version: number;
};

/**
 * What a coach is allowed to see of one roster athlete, assembled server-side.
 *
 * This is the whole coach→athlete surface behind one gate: it resolves the
 * active Coaching Link first, and if there is none — no link, or a severed one
 * — it returns `null` and nothing is read. A forged athlete id in the request
 * cannot get past the link query, so the refusal is server-enforced, not a
 * hidden button (ticket 11).
 *
 * When the link exists, Link Visibility is applied *before the data leaves the
 * server*: with `shareAthleteReports` off, the Session Reflection fields are
 * stripped from both the calendar sessions and the Information View inputs, so
 * the Body & Mind panel renders no panel and the reflections never reach the
 * browser at all. The calendar and its session parameters are always included —
 * the plan has no flag (ADR 0003).
 *
 * `shareAiTranscripts` IS enforced here now: `getSharedTranscripts` returns the
 * Coach Chat and Weekly Session transcripts only when the flag is on, and
 * `null` otherwise — the transcripts are never fetched when withheld, so
 * nothing exists to leak toward the client (Link Visibility at the query, not
 * the UI). The view exposes `sharedTranscripts` only when the link permits it.
 */
export type CoachAthleteView = {
  athleteName: string;
  visibility: LinkVisibility;
  calendarSessions: Session[];
  /** The athlete's Unavailable Dates — part of the always-visible calendar. */
  unavailableDates: string[];
  /** The plan as the Head Coach's editing surface, past sessions excluded. */
  planSessions: PlanSession[];
  /** Shared transcripts, or null when `share_ai_transcripts` is off. */
  sharedTranscripts: SharedTranscript[] | null;
  dataset: InfoDataset;
};

export async function getCoachAthleteView(
  coachId: string,
  athleteId: string,
  todayKey: string,
): Promise<CoachAthleteView | null> {
  // The authorization gate: no active link → not your athlete → nothing read.
  const link = await getActiveLink(coachId, athleteId);
  if (!link) return null;
  const { visibility } = link;

  const [athleteName, calendarRows, unavailableDates, sharedTranscripts, { rows, streams }] =
    await Promise.all([
      getAthleteName(athleteId),
      getDb()
        .select()
        .from(sessions)
        .where(eq(sessions.athleteId, athleteId))
        .orderBy(asc(sessions.date), asc(sessions.dayOrder)),
      // The calendar and its statuses are always visible (ADR 0003), and a day
      // the athlete marked off is part of that plan — so the coach sees it too.
      getUnavailableDates(athleteId),
      // Gated on share_ai_transcripts: null (unfetched) when the flag is off.
      getSharedTranscripts(link),
      getInformationViewInputs(athleteId),
    ]);

  const calendarSessions = applyVisibilityToSessions(
    calendarRows.map(toSession),
    visibility,
  );
  const dataset = buildDataset(
    applyVisibilityToInputs(rows, visibility),
    streams,
    todayKey,
  );

  // The editing surface is the current-and-future plan: a completed or past
  // session is the record, not something the Head Coach re-plans (ADR 0002).
  // `editable` is the content-authority guard, so the UI shows edit/delete only
  // where the server would allow it — the button matches the rule.
  const planSessions: PlanSession[] = calendarRows
    .filter((r) => r.date >= todayKey && r.status !== 'completed')
    .map((r) => ({
      id: r.id,
      date: r.date,
      type: r.type,
      status: r.status,
      origin: r.origin,
      duration: r.duration,
      zone: r.zone,
      title: r.title,
      note: r.note,
      editable: canHeadCoachEditContent(r.origin),
      version: r.version,
    }));

  return {
    athleteName: athleteName ?? UNKNOWN_ATHLETE,
    visibility,
    calendarSessions,
    unavailableDates,
    planSessions,
    sharedTranscripts,
    dataset,
  };
}
