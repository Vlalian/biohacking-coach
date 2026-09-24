import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { GlossaryView } from './glossary-view';

// The page itself is static copy, but it sits inside the app shell, which
// depends on who is signed in — so it is guarded and served per request like
// every other View. Signed out, it is not a page at all — it redirects to
// sign-in.
export const dynamic = 'force-dynamic';

/**
 * `/glossary` — the Glossary View (`eval-mvp-build/16`). No repository, no
 * athlete row: the content is the same for everyone, held in the catalogues.
 */
export default async function GlossaryPage({
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

  const t = await getTranslations('Glossary');

  return (
    <div className="flex flex-col items-center gap-8 p-6 sm:p-8">
      <header className="flex w-full max-w-5xl flex-col items-start gap-1 border-b border-border pb-6">
        <h1 className="font-display text-4xl font-bold uppercase italic leading-none tracking-[0.03em] text-foreground">
          {t('title')}
        </h1>
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">
          {t('subtitle')}
        </p>
      </header>
      <GlossaryView />
    </div>
  );
}
