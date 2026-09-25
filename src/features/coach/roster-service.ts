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
  getRoster,
  getSharedTranscripts,
  UNKNOWN_ATHLETE,
  type SharedTranscript,
} from './coach-repository';
import type { RosterEntry } from './coach';
import { getAthleteById } from '@/features/athlete/athlete-repository';
import { draftDueWeek, HEAD_COACH_LEAD_DAYS, type WeekDraft } from './week-draft';
import { getPendingWeekDraft } from './week-draft-repository';
import { draftInFlight } from './week-draft-service';
import { canHeadCoachEditContent } from './head-coach-authority';
import { getResolvedBlocks, type ResolvedBlocks } from './training-block-service';
import { isStaleSet, type TrainingBlock } from './training-blocks';
import type { LinkVisibility } from './link-visibility';
import {
  applyVisibilityToInputs,
  applyVisibilityToSessions,
  canSeeAthleteReports,
} from './link-visibility';
import { getHealthHistory, getOpenIllnesses, getOpenInjuries } from '@/features/health/health-repository';
import { spansFrom, type HealthSpan } from '@/features/health/health-layer';

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
/**
 * The athlete's Training Blocks as the Head Coach's editing surface
 * (`training-architecture/08`). Plan structure, so always present when there is
 * a Target Race (ADR 0003) — outside the visibility branch. `version` is the
 * compare-and-swap token an edit sends back; `0` means nothing is stored yet
 * and the blocks shown are the arithmetic draft the edit will materialise.
 */
export type CoachBlocksView = {
  raceId: string;
  raceName: string;
  raceDate: string;
  version: number;
  /**
   * True when a set is stored but no longer ends on race day: the blocks shown
   * are the arithmetic draft, the rows underneath are the old set, and the
   * panel must not offer an edit that would land on the latter.
   */
  stale: boolean;
  startDate: string;
  blocks: TrainingBlock[];
};

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
  /** The athlete's Weekly Session Day — the coach's to set while linked (`training-architecture/17`). */
  weeklySessionDay: string | null;
  /** The drafted week awaiting the coach's approval, read without the athlete's day-early filter; null when none. */
  pendingDraft: WeekDraft | null;
  /** The previewed week being drafted right now, so the page can say so instead of showing nothing (`/29`); null otherwise. */
  draftInFlight: { weekStart: string } | null;
  /**
   * The athlete's Injuries and Illnesses as calendar spans, or **null** when
   * `share_athlete_reports` is off (`training-architecture/06`). Null and never
   * `[]`: a coach who could tell "no injuries" from "not shared" could infer
   * health state from absence. Not fetched at all when withheld — the same
   * discipline as the transcripts, and the same flag slice 04 put the capacity
   * statement behind.
   */
  health: HealthSpan[] | null;
  /** What is open right now, for the header badge; null when withheld, like `health`. */
  openHealth: OpenHealth | null;
  dataset: InfoDataset;
  /** The Training Blocks — always visible; null when the athlete has no Target Race. */
  blocks: CoachBlocksView | null;
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

  const [athleteName, calendarRows, unavailableDates, sharedTranscripts, { rows, streams }, horizon, athlete, health] =
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
      // The Training Blocks are the structure the calendar is built toward —
      // plan, not report — so they are read here, outside the visibility branch.
      getResolvedBlocks(athleteId, todayKey),
      getAthleteById(athleteId),
      // Gated on share_athlete_reports: null (unfetched) when the flag is off.
      canSeeAthleteReports(visibility)
        ? getHealthHistory(athleteId).then((h) => spansFrom(h.injuries, h.illnesses))
        : Promise.resolve(null),
    ]);
  // The week the coach previews: the one the athlete's next cycle drafts for,
  // a day early (17). Plan structure, so outside the visibility branch too.
  const weeklySessionDay = storedDayOf(athlete);
  const { pendingDraft, draftInFlight: inFlight } = await coachPreview(athleteId, athlete, todayKey);

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
    health,
    // Derived from the spans already fetched — one read, two surfaces. Null
    // travels straight through: withheld is withheld everywhere.
    openHealth: health && openHealthFromSpans(health),
    dataset,
    blocks: blocksViewOf(horizon, todayKey),
    weeklySessionDay,
    pendingDraft,
    draftInFlight: inFlight,
  };
}

/** The athlete's stored Weekly Session Day, or null for a missing row or profile. */
export function storedDayOf(athlete: { profile: { weeklySessionDay?: string } | null } | undefined): string | null {
  return athlete?.profile?.weeklySessionDay ?? null;
}

/** A draft is waiting for the coach while it is the Coach's own and not yet their approved version. */
export function awaitsReview(pending: WeekDraft | null): boolean {
  return pending !== null && !pending.approved;
}

/**
 * The week a Head Coach previews for this athlete today: the athlete's next
 * cycle, a day early (`/17`). Read without the athlete's visibility filter.
 * The athlete row is passed in because both callers already hold it.
 */
function previewWeekOf(athlete: Awaited<ReturnType<typeof getAthleteById>>, todayKey: string): string {
  return draftDueWeek(todayKey, storedDayOf(athlete), HEAD_COACH_LEAD_DAYS);
}

/**
 * The preview, and — when there is none — whether it is being drafted right
 * now (`/29`). Only a draft for the previewed week counts: the gate may be
 * drafting this week's remainder for a new athlete (`/24`), and this page does
 * not show that week, so saying "drafting" would promise a card that never
 * comes.
 */
async function coachPreview(
  athleteId: string,
  athlete: Awaited<ReturnType<typeof getAthleteById>>,
  todayKey: string,
): Promise<{ pendingDraft: WeekDraft | null; draftInFlight: { weekStart: string } | null }> {
  const previewWeek = previewWeekOf(athlete, todayKey);
  const pendingDraft = await getPendingWeekDraft(athleteId, previewWeek);
  if (pendingDraft) return { pendingDraft, draftInFlight: null };
  const inFlight = await draftInFlight(athleteId, todayKey);
  if (inFlight?.weekStart === previewWeek) return { pendingDraft: null, draftInFlight: { weekStart: previewWeek } };
  // Nothing in flight: the draft may have landed between the two reads, so
  // read the preview once more before showing neither (CodeRabbit, PR #78).
  return { pendingDraft: await getPendingWeekDraft(athleteId, previewWeek), draftInFlight: null };
}

/**
 * The athlete's open Injuries and Illness, as a coach surface names them.
 *
 * **Null when the athlete withholds their reports** — never an empty shape. A
 * coach who could tell "no open injuries" from "not shared" would read health
 * from absence, which is the inference the whole Link Visibility gate exists to
 * prevent (`showable-version/28b`). The records are not fetched at all when
 * withheld, the same discipline {@link getCoachAthleteView} applies.
 */
export type OpenHealth = {
  /** One entry per open Injury, its name or `null` when the athlete never gave one. */
  injuries: (string | null)[];
  ill: boolean;
};

/** A Roster row, plus whether a drafted week is waiting for this coach's eye. */
export type RosterEntryWithReview = RosterEntry & {
  awaitingReview: boolean;
  openHealth: OpenHealth | null;
};

/**
 * The Roster with the one thing waiting for the coach that `training-architecture/17`
 * adds: a drafted week they have not yet approved. One read per athlete — the
 * Roster is a handful of people, and the read is one indexed query.
 */
export async function getRosterWithReviews(coachId: string, todayKey: string): Promise<RosterEntryWithReview[]> {
  const roster = await getRoster(coachId);
  return Promise.all(
    roster.map(async (entry) => {
      const athlete = await getAthleteById(entry.athleteId);
      const pending = await getPendingWeekDraft(entry.athleteId, previewWeekOf(athlete, todayKey));
      return {
        ...entry,
        awaitingReview: awaitsReview(pending),
        openHealth: await openHealthFor(entry.athleteId, entry.link.visibility),
      };
    }),
  );
}

/**
 * What is open for this athlete right now, or null when they withhold reports.
 *
 * An unnamed injury still counts: `injury.name` is optional (migration 0028),
 * and "something is open" is the fact the badge carries — the name only makes
 * it specific. The `null` travels as `null`; naming it is the surface's job,
 * because the word is a translation and this module renders none.
 */
async function openHealthFor(athleteId: string, visibility: LinkVisibility): Promise<OpenHealth | null> {
  if (!canSeeAthleteReports(visibility)) return null;
  const [injuries, illnesses] = await Promise.all([
    getOpenInjuries(athleteId),
    getOpenIllnesses(athleteId),
  ]);
  return { injuries: injuries.map((injury) => injury.name), ill: illnesses.length > 0 };
}

/**
 * The same shape {@link openHealthFor} builds, read off spans already in hand.
 *
 * A span is open when it has no end (`to === null`) — the same rule
 * `marksFor` draws the signal-coloured icon by.
 */
function openHealthFromSpans(spans: HealthSpan[]): OpenHealth {
  const open = spans.filter((span) => span.to === null);
  return {
    injuries: open.filter((span) => span.kind === 'injury').map((span) => span.name),
    ill: open.some((span) => span.kind === 'illness'),
  };
}

/**
 * The resolved blocks as the panel's editing surface. With nothing stored the
 * version is 0 and the start is today: the edit will materialise the arithmetic
 * draft from today, so that is the set the panel is describing.
 */
function blocksViewOf(horizon: ResolvedBlocks, todayKey: string): CoachBlocksView | null {
  if (!horizon.race) return null;
  return {
    raceId: horizon.race.id,
    raceName: horizon.race.name,
    raceDate: horizon.race.date,
    version: horizon.set?.version ?? 0,
    stale: isStaleSet(horizon.set, horizon.race.date),
    startDate: horizon.set?.startDate ?? todayKey,
    blocks: horizon.blocks,
  };
}
