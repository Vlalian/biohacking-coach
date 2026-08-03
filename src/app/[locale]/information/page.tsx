import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import {
  getAthleteByUserId,
  getInformationViewLayout,
} from '@/features/athlete/athlete-repository';
import { buildDataset } from '@/features/information-view/build-dataset';
import { getInformationViewInputs } from '@/features/information-view/information-view-repository';
import { parseLayout } from '@/features/information-view/layout';
import { PANEL_IDS } from '@/features/information-view/panels';
import { dateKey } from '@/lib/date';
import { InformationView } from './information-view';
import { saveLayoutAction } from './layout-actions';

// Read per-request: the page depends on who is signed in, so it can never be
// prerendered. Signed out, it is not a page at all — it redirects to sign-in.
export const dynamic = 'force-dynamic';

export default async function InformationPage({
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

  const t = await getTranslations('Information');
  const athlete = await getAthleteByUserId(session!.user.id);

  // The signed-in athlete's own rows only — the repository scopes both reads
  // to this athlete id, so the dataset cannot contain anyone else's training
  // (ADR 0006). The dataset is built server-side; the client only windows it.
  let view = null;
  if (athlete) {
    const [{ rows, streams }, storedLayout] = await Promise.all([
      getInformationViewInputs(athlete.id),
      getInformationViewLayout(athlete.id),
    ]);
    const dataset = buildDataset(rows, streams, dateKey(new Date()));
    const layout = parseLayout(storedLayout, PANEL_IDS);
    view = (
      <InformationView
        dataset={dataset}
        initialLayout={layout}
        saveLayout={saveLayoutAction}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <header className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
        <Link href="/" className="text-sm text-blue-500 underline">
          {t('backToPlan')}
        </Link>
      </header>
      {view ?? <p className="text-neutral-500">{t('noAthlete')}</p>}
    </main>
  );
}
