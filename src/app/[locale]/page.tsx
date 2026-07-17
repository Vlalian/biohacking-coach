import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getCurrentAthlete } from '@/features/athlete/athlete-repository';

// Read per-athlete data at request time, never at build time. Slice 02 makes
// this inherently dynamic anyway (the page depends on who is signed in), and
// prerendering it would mean the build needed a live database.
export const dynamic = 'force-dynamic';

export default async function AthletePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('AthletePage');
  const athlete = await getCurrentAthlete();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-12">
      {athlete ? (
        <>
          <h1 className="text-3xl font-semibold">
            {t('greeting', { name: athlete.displayName })}
          </h1>
          <p className="text-neutral-500">{t('tagline')}</p>
        </>
      ) : (
        <p className="text-neutral-500">{t('noAthlete')}</p>
      )}
    </main>
  );
}
