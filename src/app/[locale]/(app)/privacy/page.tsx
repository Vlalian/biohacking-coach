import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
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

  const t = await getTranslations('Privacy');

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <ConsentScreen granted={granted} mode="manage" />

      {/*
        Export and erasure are *explained* here and *exercised* in Settings
        (`showable-version/10`). The ticket named both views as candidates and
        said to pick one and link from the other: the controls sit next to the
        other account actions, and this view — which is where an athlete comes to
        read about their rights — points at them.
      */}
      <section className="w-full max-w-xl border border-border bg-panel p-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          {t('dataRightsTitle')}
        </h2>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          {t('dataRightsBody')}
        </p>
        <Link
          href="/settings"
          className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.16em] text-signal underline transition-opacity hover:opacity-80"
        >
          {t('dataRightsLink')}
        </Link>
      </section>
    </div>
  );
}
