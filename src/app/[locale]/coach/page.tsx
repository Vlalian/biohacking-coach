import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getCoachByUserId, getRoster } from '@/features/coach/coach-repository';

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

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  const t = await getTranslations('Roster');
  const coach = await getCoachByUserId(session!.user.id);

  // A user with no coach row is not a coach — the Roster is not their page.
  // A person can hold both a coach and an athlete row; this page is only the
  // coach half of them.
  if (!coach) {
    return (
      <main className="flex min-h-screen flex-col items-center gap-6 p-8">
        <p className="text-neutral-500">{t('notACoach')}</p>
      </main>
    );
  }

  const roster = await getRoster(coach.id);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
      </header>

      {roster.length === 0 ? (
        <p className="text-neutral-500">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {roster.map((entry) => (
            <li key={entry.athleteId}>
              <Link
                href={`/coach/athlete/${entry.athleteId}`}
                className="flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="font-medium">{entry.name}</span>
                <span className="flex gap-2 text-xs text-neutral-500">
                  {!entry.link.visibility.shareAthleteReports && (
                    <span className="rounded-full border px-2 py-0.5">
                      {t('reportsWithheld')}
                    </span>
                  )}
                  {!entry.link.visibility.shareAiTranscripts && (
                    <span className="rounded-full border px-2 py-0.5">
                      {t('transcriptsWithheld')}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
