import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { getLinkForAthlete } from '@/features/coach/coach-repository';
import { getUiPrefs } from '@/features/user-prefs/user-prefs-repository';
import {
  addFixedConstraintAction,
  removeFixedConstraintAction,
  severCoachingLinkAction,
  updateCommunicationStyleAction,
  updateRaceTargetAction,
  updateLanguageAction,
  updateLinkVisibilityAction,
  updateWeeklySessionDayAction,
} from './settings-actions';
import { SettingsView } from './settings-view';

// Read per-request: the page depends on who is signed in, so it can never be
// prerendered. Signed out, it is not a page at all — it redirects to sign-in.
export const dynamic = 'force-dynamic';

export default async function SettingsPage({
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

  const t = await getTranslations('Settings');
  const athlete = await getAthleteByUserId(session!.user.id);

  if (!athlete) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <p className="font-body text-sm text-muted-foreground">{t('noAthlete')}</p>
      </div>
    );
  }

  // The athlete's own rows only — both reads are scoped to this athlete id
  // (ADR 0006). `coachingLink` is undefined for a solo athlete; the view
  // renders the Sharing section only when it is present.
  const [uiPrefs, athleteLink] = await Promise.all([
    getUiPrefs(session!.user.id),
    getLinkForAthlete(athlete.id),
  ]);

  return (
    <SettingsView
      profile={{
        name: session!.user.name,
        email: session!.user.email,
        communicationStyle: athlete.communicationStyle ?? '',
        raceTarget: athlete.raceTarget ?? '',
        weeklySessionDay: athlete.profile?.weeklySessionDay ?? null,
        fixedConstraints: athlete.profile?.fixedConstraints ?? [],
      }}
      language={uiPrefs.language ?? locale}
      coachingLink={
        athleteLink
          ? {
              headCoachName: athleteLink.headCoachName,
              shareAthleteReports: athleteLink.link.visibility.shareAthleteReports,
              shareAiTranscripts: athleteLink.link.visibility.shareAiTranscripts,
            }
          : null
      }
      onUpdateCommunicationStyle={updateCommunicationStyleAction}
      onUpdateRaceTarget={updateRaceTargetAction}
      onUpdateWeeklySessionDay={updateWeeklySessionDayAction}
      onAddFixedConstraint={addFixedConstraintAction}
      onRemoveFixedConstraint={removeFixedConstraintAction}
      onUpdateLanguage={updateLanguageAction}
      onSetLinkVisibility={updateLinkVisibilityAction}
      onSeverCoachingLink={severCoachingLinkAction}
    />
  );
}
