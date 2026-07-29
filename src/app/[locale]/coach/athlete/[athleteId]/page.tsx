import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getCoachByUserId } from '@/features/coach/coach-repository';
import { getCoachAthleteView } from '@/features/coach/roster-service';
import { parseLayout } from '@/features/information-view/layout';
import { PANEL_IDS } from '@/features/information-view/panels';
import { dateKey } from '@/lib/date';
import { Calendar } from '@/app/[locale]/calendar';
import { InformationView } from '@/app/[locale]/information/information-view';

// Per-request: the page depends on the signed-in coach and the requested
// athlete, and it must never be prerendered or cached across coaches.
export const dynamic = 'force-dynamic';

export default async function CoachAthletePage({
  params,
}: {
  params: Promise<{ locale: string; athleteId: string }>;
}) {
  const { locale, athleteId } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  const t = await getTranslations('Roster');
  const coach = await getCoachByUserId(session!.user.id);
  if (!coach) {
    return (
      <main className="flex min-h-screen flex-col items-center gap-6 p-8">
        <p className="text-neutral-500">{t('notACoach')}</p>
      </main>
    );
  }

  // The one gate: the service returns null unless an active Coaching Link joins
  // this coach to this athlete. A forged athlete id lands here and is refused —
  // the refusal is a 404, indistinguishable from an athlete that does not exist,
  // so it leaks nothing about who is on other coaches' rosters.
  const view = await getCoachAthleteView(coach.id, athleteId, dateKey(new Date()));
  if (!view) {
    notFound();
  }

  // The coach's ONE roster-wide layout (ADR 0004), applied read-only — the
  // coach never writes to the athlete's row.
  const layout = parseLayout(coach.informationViewLayout, PANEL_IDS);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center gap-6 p-8">
      <header className="flex w-full flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold">{view.athleteName}</h1>
        <Link href="/coach" className="text-sm text-blue-500 underline">
          {t('backToRoster')}
        </Link>
      </header>

      <Calendar
        sessions={view.calendarSessions}
        todayKey={dateKey(new Date())}
        readOnly
      />
      <InformationView dataset={view.dataset} initialLayout={layout} persistLayout={false} />
    </main>
  );
}
