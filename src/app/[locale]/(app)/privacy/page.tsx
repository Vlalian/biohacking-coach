import { setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { getActiveConsents } from '@/features/consent/consent-repository';
import { currentlyConsentedPurposes } from '@/features/consent/consent';
import { ConsentScreen } from '../../consent';

// Read per-request: the page depends on who is signed in, so it can never be
// prerendered. Signed out, it is not a page at all — it redirects to sign-in.
export const dynamic = 'force-dynamic';

/**
 * Privacy & consent — the athlete's standing management surface for what they
 * have agreed to let the app process, and the withdrawal path (gdpr-decisions
 * item A/B). The consent screen renders in `manage` mode: it lists each purpose,
 * shows whether it is granted, and offers grant/withdraw per purpose. Withdrawing
 * a required purpose drops the render gate back into place on the athlete's plan.
 */
export default async function PrivacyPage({
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

  // The athlete's own consents only — scoped to their id by the repository, so
  // no shape of this reads another athlete's grants (ADR 0006).
  const athlete = await getAthleteByUserId(session!.user.id);
  const granted = athlete
    ? currentlyConsentedPurposes(await getActiveConsents(athlete.id))
    : [];

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <ConsentScreen granted={granted} mode="manage" />
    </div>
  );
}
