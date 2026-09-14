import { loadCoachAthlete, NotACoach } from '../coach-athlete-guard';
import { PrescribePanel } from '../prescribe-panel';
import { BlockPanel } from '../block-panel';
import { CoachCalendar } from './coach-calendar';

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

  return (
    <>
      {/* The horizon the week below is built toward, and the one surface where a
          Head Coach may rename a block or move its end (training-architecture/08). */}
      <BlockPanel athleteId={athleteId} set={view.blocks ?? null} />
      <CoachCalendar
        athleteId={athleteId}
        sessions={view.calendarSessions}
        unavailableDates={view.unavailableDates}
        todayKey={todayKey}
      />
      <PrescribePanel athleteId={athleteId} />
    </>
  );
}
