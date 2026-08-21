import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { loadCoachAthlete } from './coach-athlete-guard';
import { AthleteTabs } from './athlete-tabs';

// Per-request: depends on the signed-in coach and the requested athlete, and
// must never be prerendered or cached across coaches.
export const dynamic = 'force-dynamic';

/**
 * The frame around one athlete's three tabs: their name, the way back to the
 * Roster, and the switcher.
 *
 * It runs the same guard the tabs do, but ONLY to resolve the athlete's name —
 * a layout does not protect the pages beneath it, so this is never the check
 * that matters. When the guard refuses, the frame renders nothing and the page
 * beneath produces the real answer (its own 404, or the not-a-coach state).
 */
export default async function CoachAthleteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; athleteId: string }>;
}) {
  const { locale, athleteId } = await params;
  const context = await loadCoachAthlete(locale, athleteId);
  if (!context.ok) return <>{children}</>;

  const t = await getTranslations('Roster');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 p-6 sm:p-8">
      <header className="flex w-full flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold">{context.view.athleteName}</h1>
        <Link href="/coach" className="text-sm text-blue-500 underline">
          {t('backToRoster')}
        </Link>
      </header>

      <AthleteTabs
        athleteId={athleteId}
        labels={{ plan: t('tabPlan'), data: t('tabData'), briefing: t('tabBriefing') }}
      />

      {children}
    </div>
  );
}
