import { loadCoachAthlete, NotACoach } from '../coach-athlete-guard';
import { PrescribePanel } from '../prescribe-panel';
import { BlockPanel } from '../block-panel';
import { CoachCalendar } from './coach-calendar';
import { WeeklySessionDayCard } from '../weekly-session-day-card';
import { getPreferredNameForAthlete } from '@/features/user-prefs/user-prefs-repository';
import { displayNameFor, raceFacts } from '@/features/coach/weekly-session-day';
import { WeekDraftReview } from '../week-draft-review';
import { DraftingCard } from '@/app/[locale]/drafting-card';

// Per-request: depends on the signed-in coach and the requested athlete.
export const dynamic = 'force-dynamic';

/**
 * The training week, and the surface for changing it.
 *
 * Calendar and PrescribePanel share a tab deliberately: a Head Coach chooses
 * what to prescribe by looking at the week they are prescribing into, so
 * splitting them would mean holding one in your head while using the other.
 *
 * The calendar is read-only except for placement: since 2026-08-21 a Head Coach
 * may drag a session on a linked athlete's plan (ADR 0003 amendment).
 */
export default async function CoachAthletePlanPage({
  params,
}: {
  params: Promise<{ locale: string; athleteId: string }>;
}) {
  const { locale, athleteId } = await params;
  const context = await loadCoachAthlete(locale, athleteId);
  if (!context.ok) return <NotACoach />;

  const { view, todayKey } = context;
  // The Preferred Name is read through the user seam for the linked athlete
  // (preferred-name/02), here rather than in the roster view: only this card
  // addresses the athlete by name.
  const preferredName = await getPreferredNameForAthlete(athleteId);

  return (
    <>
      {/* The horizon the week below is built toward, and the one surface where a
          Head Coach may rename a block or move its end (training-architecture/08). */}
      {/* Keyed by the snapshot: the panel copies `set` into state, and without
          a key `router.refresh()` would keep those rows while a newer version
          or a `stale` set arrived underneath (CodeRabbit, PR #65). */}
      <BlockPanel
        key={`${athleteId}:${view.blocks?.raceId ?? 'none'}:${view.blocks?.version ?? 0}:${view.blocks?.stale ?? false}`}
        athleteId={athleteId}
        set={view.blocks ?? null}
      />
      {/* The drafted week, a day before the athlete sees it, and the day it
          reaches them — both the Head Coach's while linked (training-architecture/17). */}
      {/* Keyed by the draft: the panel copies the rows into state, and a
          refresh that brought a different draft must not land in the old
          rows (CodeRabbit, PR #69 — the same fix the block panel got). */}
      <WeekDraftReview key={view.pendingDraft?.id ?? 'none'} athleteId={athleteId} draft={view.pendingDraft} />
      {/* The same slot while that draft is still being written by the shell's
          after(): says so, and re-reads until the review panel above has a
          draft to show (training-architecture/29). */}
      {view.draftInFlight && (
        <DraftingCard weekStart={view.draftInFlight.weekStart} waiter={{ side: 'coach', athleteId }} />
      )}
      {/* The athlete's Weekly Session Day as a stated fact, with the dates it
          drives and a confirmed change (training-architecture/28). */}
      <WeeklySessionDayCard
        athleteId={athleteId}
        value={view.weeklySessionDay}
        todayKey={todayKey}
        athleteName={displayNameFor(preferredName)}
        race={raceFacts(todayKey, view.blocks)}
        locale={locale}
      />
      <CoachCalendar
        athleteId={athleteId}
        sessions={view.calendarSessions}
        unavailableDates={view.unavailableDates}
        todayKey={todayKey}
        health={view.health}
      />
      <PrescribePanel athleteId={athleteId} />
    </>
  );
}
