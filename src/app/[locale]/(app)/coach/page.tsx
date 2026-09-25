import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getCurrentSession } from '../current-user';
import { getCoachByUserId } from '@/features/coach/coach-repository';
import { getRosterWithReviews } from '@/features/coach/roster-service';
import { getResolvedBlocks } from '@/features/coach/training-block-service';
import { initialsOf, rosterCardOf } from '@/features/coach/roster-card';
import { today } from '@/lib/date';
import { HealthBadge } from './health-badge';

// Per-request: the page depends on who is signed in, so it is never prerendered.
export const dynamic = 'force-dynamic';

export default async function CoachRosterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const session = await getCurrentSession();
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  const t = await getTranslations('Roster');
  // The words for an open record are the Health Drawer's — one vocabulary for
  // an injury and an illness, wherever they are named (`showable-version/28b`).
  const tHealth = await getTranslations('HealthDrawer');
  const coach = await getCoachByUserId(session!.user.id);

  // A user with no coach row is not a coach — the Roster is not their page.
  // A person can hold both a coach and an athlete row; this page is only the
  // coach half of them.
  if (!coach) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <p className="font-body text-base text-muted-foreground">{t('notACoach')}</p>
      </div>
    );
  }

  const todayKey = today();
  const roster = await getRosterWithReviews(coach.id, todayKey);

  // Each card carries the athlete's race and the block they are in — the same
  // resolved horizon the athlete's Plan tab shows this coach, so the Roster
  // exposes nothing the athlete page does not. A handful of reads; the Roster
  // is a handful of people.
  const cards = await Promise.all(
    roster.map(async (entry) => ({
      entry,
      ...rosterCardOf(await getResolvedBlocks(entry.athleteId, todayKey), todayKey),
    })),
  );
  const toReview = roster.filter((e) => e.awaitingReview).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-8 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b-4 border-foreground pb-5">
        <div>
          <span className="font-body text-sm uppercase tracking-[0.18em] text-muted-foreground">
            {t('subtitle')}
          </span>
          <h1 className="mt-1 font-display text-5xl font-bold uppercase italic leading-none tracking-tight text-foreground lg:text-6xl">
            {t('title')}
          </h1>
        </div>
        {roster.length > 0 && (
          <p className="font-body text-sm uppercase tracking-[0.18em] text-muted-foreground">
            {t('summary', { athletes: roster.length })}
            {toReview > 0 && (
              <>
                {' · '}
                <span className="text-signal">{t('summaryReview', { n: toReview })}</span>
              </>
            )}
          </p>
        )}
      </header>

      {roster.length === 0 ? (
        <div className="border border-dashed border-border bg-panel px-8 py-12 text-center">
          <p className="font-display text-3xl font-bold uppercase italic tracking-[0.02em] text-foreground">
            {t('empty')}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {cards.map(({ entry, race, block }) => (
            <li key={entry.athleteId}>
              <Link
                href={`/coach/athlete/${entry.athleteId}`}
                className={[
                  'group flex h-full items-start gap-4 border border-l-4 bg-panel p-5 no-underline shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  entry.awaitingReview ? 'border-border border-l-signal' : 'border-border hover:border-l-signal',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center bg-sidebar font-display text-2xl font-bold italic text-sidebar-foreground"
                >
                  {initialsOf(entry.name)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-2xl font-bold uppercase italic leading-tight tracking-[0.02em] text-foreground transition-colors group-hover:text-signal">
                    {entry.name}
                  </span>

                  {race ? (
                    <span className="mt-1 block font-body text-sm uppercase tracking-[0.14em] text-muted-foreground">
                      {race.name} ·{' '}
                      <span className="whitespace-nowrap text-signal">{t('raceCountdown', { days: race.days })}</span>
                    </span>
                  ) : (
                    <span className="mt-1 block font-body text-sm uppercase tracking-[0.14em] text-muted-foreground">
                      {t('noRace')}
                    </span>
                  )}

                  {block && (
                    <span className="mt-0.5 block font-body text-sm text-muted-foreground">
                      {t('blockLine', { block: block.name, week: block.week, weeks: block.weeks })}
                    </span>
                  )}

                  {/* Open injuries and illness (showable-version/28b). Nothing for a
                      healthy athlete or one whose reports are withheld; the line
                      collapses when the badge renders nothing. */}
                  <span className="mt-2 flex font-body text-[13px] empty:hidden">
                    <HealthBadge
                      openHealth={entry.openHealth}
                      injuryLabel={tHealth('injuryLabel')}
                      illLabel={tHealth('illnessLabel')}
                    />
                  </span>

                  {(entry.awaitingReview ||
                    !entry.link.visibility.shareAthleteReports ||
                    !entry.link.visibility.shareAiTranscripts) && (
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      {entry.awaitingReview && (
                        <span className="bg-signal px-2.5 py-1 font-body text-[13px] font-semibold uppercase tracking-[0.12em] text-signal-foreground">
                          {t('weekToReview')}
                        </span>
                      )}
                      {!entry.link.visibility.shareAthleteReports && (
                        <span className="border border-border px-2.5 py-1 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
                          {t('reportsWithheld')}
                        </span>
                      )}
                      {!entry.link.visibility.shareAiTranscripts && (
                        <span className="border border-border px-2.5 py-1 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
                          {t('transcriptsWithheld')}
                        </span>
                      )}
                    </span>
                  )}
                </span>

                <ChevronRight
                  aria-hidden="true"
                  className="mt-2 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-signal"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
