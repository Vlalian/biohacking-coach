import { hasLocale } from 'next-intl';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { provisionAthlete } from '@/features/athlete/athlete-provisioning';
import { nextStep } from '@/features/onboarding/onboarding-flow';
import { getActiveConsents } from '@/features/consent/consent-repository';
import {
  currentlyConsentedPurposes,
  missingRequiredConsents,
} from '@/features/consent/consent';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { OnboardingFlow } from './onboarding';
import { ConsentScreen } from './consent';

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

    // The consent gate: before any of the athlete's data is processed, the
    // required processing purposes must be consented under the current
    // disclosure version (GDPR lawful basis; gdpr-decisions item A). This is the
    // render half of the gate — the AI call itself is refused server-side by
    // assertAiCoachingConsent. Placed before onboarding so no health-adjacent
    // data is collected without a lawful basis to process it.
    if (athlete) {
      const activeConsents = await getActiveConsents(athlete.id);
      if (missingRequiredConsents(activeConsents).length > 0) {
        return (
          <main className="flex min-h-screen flex-col items-center gap-6 p-8">
            <ConsentScreen
              granted={currentlyConsentedPurposes(activeConsents)}
              mode="gate"
            />
            <SignOutButton />
          </main>
        );
      }
    }

    // The onboarding gate: an athlete without an experience level has not
    // finished MCQ onboarding — the columns land only at completion — so the
    // page is the Coach's question flow, resumed at the first unanswered step
    // (the stored answers are the resume point).
    if (athlete && athlete.experienceLevel === null) {
      const answers = athlete.profile?.onboardingAnswers ?? {};
      const submitted = athlete.profile?.onboardingSubmitted ?? {};
      const step = nextStep(answers, submitted);
      // step === 'done' with the columns still null means a completion write was
      // interrupted; fall through to the calendar rather than trapping the
      // athlete on a finished questionnaire.
      if (step !== 'done') {
        return (
          <main className="relative h-screen">
            <div className="absolute right-4 top-4 z-10">
              <SignOutButton />
            </div>
            <OnboardingFlow initial={{ step, answers }} />
          </main>
        );
      }
    }

    // Every gate passed: Training Plan is the default View (ADR 0007), and it
    // — like every View — lives inside the shared Navigation Drawer / Coach
    // Overlay shell, not inline on this gate page.
    if (athlete) {
      redirect({ href: '/training-plan', locale });
    }

    // Provisioning could not recover a row for this user — a broken profile,
    // not a View. No shell chrome; sign-out stays reachable so it is never a
    // dead end.
    const t = await getTranslations('AthletePage');
    return (
      <main className="flex min-h-screen flex-col items-center gap-6 p-8">
        <p className="text-neutral-500">{t('noAthlete')}</p>
        <SignOutButton />
      </main>
    );
  }

  // Signed out, this is not a page — it becomes the sign-in page. redirect()
  // throws, so nothing below it runs.
  redirect({ href: '/sign-in', locale });
}
