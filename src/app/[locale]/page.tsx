import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { provisionAthlete } from '@/features/athlete/athlete-provisioning';
import { getSessionsForAthlete } from '@/features/session/session-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import {
  getLatestOpenConversation,
  getMessages,
} from '@/features/coach/conversation-repository';
import { getPendingProposal } from '@/features/coach/plan-proposal-repository';
import { nextStep } from '@/features/onboarding/onboarding-flow';
import { dateKey } from '@/lib/date';
import { SignOutButton } from './sign-out-button';
import { Calendar } from './calendar';
import { GarminUpload } from './garmin-upload';
import { WeeklySession, type WeeklySessionInitial } from './weekly-session';
import { OnboardingFlow } from './onboarding';

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
          <main className="flex min-h-screen flex-col items-center gap-6 p-8">
            <OnboardingFlow initial={{ step, answers }} />
            <SignOutButton />
          </main>
        );
      }
    }

    // Read the athlete's own training sessions, scoped to their id — the query
    // cannot return anyone else's rows (ADR 0006). Named to not be mistaken for
    // the auth `session` in this same scope.
    const trainingSessions = athlete
      ? await getSessionsForAthlete(athlete.id)
      : [];

    // The athlete's Unavailable Dates, scoped to their id like the sessions —
    // rendered as day markers and the source of the mark/clear affordance.
    const unavailableDates = athlete
      ? await getUnavailableDates(athlete.id)
      : [];

    // Restore an in-progress Weekly Session on refresh: the transcript is server
    // state, so a page reload picks it back up rather than losing it (ADR 0006).
    let weeklyInitial: WeeklySessionInitial | null = null;
    if (athlete) {
      const open = await getLatestOpenConversation(athlete.id, 'weekly_session');
      if (open) {
        const transcript = await getMessages(open.id);
        // A refresh mid-decision must not lose the pending plan: restore the
        // proposal too, so the confirm/cancel popup reappears.
        const pending = await getPendingProposal(athlete.id, open.id);
        weeklyInitial = {
          conversationId: open.id,
          weeklySessionNumber: open.weeklySessionNumber ?? 1,
          messages: transcript.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            seq: m.seq,
          })),
          proposal: pending ? { sessions: pending.sessions } : null,
          ended: false,
        };
      }
    }

    return (
      <main className="flex min-h-screen flex-col items-center gap-6 p-8">
        {athlete ? (
          <>
            <header className="flex flex-col items-center gap-1">
              <h1 className="text-2xl font-semibold">
                {t('greeting', { name: session.user.name })}
              </h1>
              <p className="text-sm text-neutral-500">{t('tagline')}</p>
              <Link href="/information" className="text-sm text-blue-500 underline">
                {t('informationLink')}
              </Link>
            </header>
            <Calendar
              sessions={trainingSessions}
              unavailableDates={unavailableDates}
              todayKey={dateKey(new Date())}
            />
            <WeeklySession initial={weeklyInitial} />
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
