import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { SignOutButton } from './sign-out-button';

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
    // fetched only to confirm the user resolves to one; once the signup hook has
    // run, it always does.
    const athlete = await getAthleteByUserId(session.user.id);

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-12">
        {athlete ? (
          <>
            <h1 className="text-3xl font-semibold">
              {t('greeting', { name: session.user.name })}
            </h1>
            <p className="text-neutral-500">{t('tagline')}</p>
            <SignOutButton />
          </>
        ) : (
          <p className="text-neutral-500">{t('noAthlete')}</p>
        )}
      </main>
    );
  }

  // Signed out, this is not a page — it becomes the sign-in page. redirect()
  // throws, so nothing below it runs.
  redirect({ href: '/sign-in', locale });
}
