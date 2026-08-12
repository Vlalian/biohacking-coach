import { setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import { EquipmentView } from './equipment-view';

// Read per-request: the page depends on who is signed in, so it can never be
// prerendered. Signed out, it is not a page at all — it redirects to sign-in.
export const dynamic = 'force-dynamic';

export default async function EquipmentPage({
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

  // The signed-in athlete's own gear only — scoped to their id by the
  // repository (ADR 0006).
  const athlete = await getAthleteByUserId(session!.user.id);
  const items = athlete ? await getEquipmentItems(athlete.id) : [];

  return (
    <div className="flex flex-col items-center p-6 sm:p-8">
      <EquipmentView items={items} />
    </div>
  );
}
