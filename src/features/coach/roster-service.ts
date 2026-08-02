import { getDb } from '@/db';
import { asc, eq } from 'drizzle-orm';
import { sessions } from '@/db/schema';
import { toSession, type Session } from '@/features/session/session';
import { buildDataset } from '@/features/information-view/build-dataset';
import type { InfoDataset } from '@/features/information-view/dataset';
import { getInformationViewInputs } from '@/features/information-view/information-view-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { getActiveLink, getAthleteName, UNKNOWN_ATHLETE } from './coach-repository';
import { canHeadCoachEditContent } from './head-coach-authority';
import {
  applyVisibilityToInputs,
  applyVisibilityToSessions,
  type LinkVisibility,
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
 * `shareAiTranscripts` needs no enforcement here because this view has no
 * transcript surface: it reads only sessions and streams, never `conversations`
 * or `messages`, so Coach Chat and Weekly Session transcripts cannot reach the
 * client by any path. The flag is carried on `visibility` for the Coach
 * Briefing that will surface transcripts (slice 13); until then the network-
 * layer guarantee holds because nothing fetches them.
 */
export type CoachAthleteView = {
  athleteName: string;
  visibility: LinkVisibility;
  calendarSessions: Session[];
  /** The athlete's Unavailable Dates — part of the always-visible calendar. */
  unavailableDates: string[];
  /** The plan as the Head Coach's editing surface, past sessions excluded. */
  planSessions: PlanSession[];
  dataset: InfoDataset;
};

export async function getCoachAthleteView(
  coachId: string,
  athleteId: string,
  todayKey: string,
): Promise<CoachAthleteView | null> {
  // The authorization gate: no active link → not your athlete → nothing read.
  const visibility = await getActiveLink(coachId, athleteId);
  if (!visibility) return null;

  const [athleteName, calendarRows, unavailableDates, { rows, streams }] =
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
    }));

  return {
    athleteName: athleteName ?? UNKNOWN_ATHLETE,
    visibility,
    calendarSessions,
    unavailableDates,
    planSessions,
    dataset,
  };
}
