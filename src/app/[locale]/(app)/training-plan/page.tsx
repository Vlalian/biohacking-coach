import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { getSessionsForAthlete } from '@/features/session/session-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { dateKey } from '@/lib/date';
import { Calendar } from '../../calendar';
import { GarminUpload } from '../../garmin-upload';
import { DetectedActivities } from '../../detected-activities';
import { listPendingActivities } from '@/features/garmin/detected-activity';

// Read per-request: the page depends on who is signed in, so it can never be
// prerendered. Signed out, it is not a page at all — it redirects to sign-in.
export const dynamic = 'force-dynamic';

/**
 * Training Plan — the default View (ADR 0007). The calendar plus the Detected
 * Activity upload that feeds it. The Weekly Session/Coach Chat conversation
 * that used to render inline here now lives in the Coach Overlay, hosted by
 * the shared (app) layout so it follows the athlete across every View.
 */
export default async function TrainingPlanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  const athlete = await getAthleteByUserId(session!.user.id);

  // Read the athlete's own training sessions, scoped to their id — the query
  // cannot return anyone else's rows (ADR 0006).
  const trainingSessions = athlete ? await getSessionsForAthlete(athlete.id) : [];

  // The athlete's Unavailable Dates, scoped to their id like the sessions —
  // rendered as day markers and the source of the mark/clear affordance.
  const unavailableDates = athlete ? await getUnavailableDates(athlete.id) : [];

  // Uploaded activities that have not been accepted yet. They are deliberately
  // not part of `trainingSessions` — a proposal is not in the training record
  // until the athlete's Reflection commits it (CONTEXT.md, Detected Activity).
  const pendingActivities = athlete ? await listPendingActivities(athlete.id) : [];

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <Calendar
        sessions={trainingSessions}
        unavailableDates={unavailableDates}
        todayKey={dateKey(new Date())}
      />
      <DetectedActivities activities={pendingActivities} locale={locale} />
      <GarminUpload />
    </div>
  );
}
