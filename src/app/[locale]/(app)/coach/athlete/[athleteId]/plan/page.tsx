import { Calendar } from '@/app/[locale]/calendar';
import { loadCoachAthlete, NotACoach } from '../coach-athlete-guard';
import { PrescribePanel } from '../prescribe-panel';

// Per-request: depends on the signed-in coach and the requested athlete.
export const dynamic = 'force-dynamic';

/**
 * The training week, and the surface for changing it.
 *
 * Calendar and PrescribePanel share a tab deliberately: a Head Coach chooses
 * what to prescribe by looking at the week they are prescribing into, so
 * splitting them would mean holding one in your head while using the other.
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
      <Calendar
        sessions={view.calendarSessions}
        unavailableDates={view.unavailableDates}
        todayKey={todayKey}
        readOnly
      />
      <PrescribePanel athleteId={athleteId} planSessions={view.planSessions} />
    </>
  );
}
