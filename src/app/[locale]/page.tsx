import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { provisionAthlete } from '@/features/athlete/athlete-provisioning';
import { getSessionsForAthlete } from '@/features/session/session-repository';
import { dateKey } from '@/lib/date';
import { SignOutButton } from './sign-out-button';
import { Calendar } from './calendar';
import { GarminUpload } from './garmin-upload';

// Read per-request: the page depends on who is signed in, so it can never be
// prerendered. Signed out, it is not a page at all — it redirects to sign-in.
export const dynamic = 'force-dynamic';

export default async function AthletePage({
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

  if (session) {
    const t = await getTranslations('AthletePage');

    // The name comes from better-auth's user record, reached through the session
    // — never from a training table (ADR 0006, route 06). The athlete row is
    // fetched only to confirm the user resolves to one.
    let athlete = await getAthleteByUserId(session.user.id);

    if (!athlete) {
      // Recovery: normally the signup hook has already minted this row, but if it
      // failed the user would be stranded here forever with no way to a profile.
      // Provisioning is idempotent, so heal it on read and re-fetch once.
      await provisionAthlete(session.user.id);
      athlete = await getAthleteByUserId(session.user.id);
    }

    // Read the athlete's own training sessions, scoped to their id — the query
    // cannot return anyone else's rows (ADR 0006). Named to not be mistaken for
    // the auth `session` in this same scope.
    const trainingSessions = athlete
      ? await getSessionsForAthlete(athlete.id)
      : [];

    return (
      <main className="flex min-h-screen flex-col items-center gap-6 p-8">
        {athlete ? (
          <>
            <header className="flex flex-col items-center gap-1">
              <h1 className="text-2xl font-semibold">
                {t('greeting', { name: session.user.name })}
              </h1>
              <p className="text-sm text-neutral-500">{t('tagline')}</p>
            </header>
            <Calendar sessions={trainingSessions} todayKey={dateKey(new Date())} />
            <GarminUpload />
          </>
        ) : (
          <p className="text-neutral-500">{t('noAthlete')}</p>
        )}
        {/* Sign-out stays reachable even when provisioning could not recover, so
            a stranded account is never a dead end. */}
        <SignOutButton />
      </main>
    );
  }

  // Signed out, this is not a page — it becomes the sign-in page. redirect()
  // throws, so nothing below it runs.
  redirect({ href: '/sign-in', locale });
}
