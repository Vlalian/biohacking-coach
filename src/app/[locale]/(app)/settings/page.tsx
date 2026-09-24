import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getPastRaces, getRaces } from '@/features/race/race-repository';
import { routing } from '@/i18n/routing';
import { getCurrentAthlete, getCurrentSession } from '../current-user';
import { getLinkForAthlete } from '@/features/coach/coach-repository';
import { getUiPrefs } from '@/features/user-prefs/user-prefs-repository';
import {
  addFixedConstraintAction,
  removeFixedConstraintAction,
  severCoachingLinkAction,
  updateCommunicationStyleAction,
  updateRaceDistanceAction,
  addRaceAction,
  setTargetRaceAction,
  removeRaceAction,
  addPastRaceAction,
  removePastRaceAction,
  updateLanguageAction,
  updatePreferredNameAction,
  updateLinkVisibilityAction,
  updateWeeklySessionDayAction,
} from './settings-actions';
import { deleteMyAccountAction } from './erasure-actions';
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

  const session = await getCurrentSession();
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  const t = await getTranslations('Settings');
  const athlete = await getCurrentAthlete();

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
  // The races, read here rather than in the view: a Race is an entity, and the
  // page is where server reads belong. All of them — the Target Race is the one
  // flagged, and the view shows the rest beside it (`training-architecture/09`).
  const [races, pastRaces] = await Promise.all([getRaces(athlete.id), getPastRaces(athlete.id)]);

  return (
    <SettingsView
      profile={{
        name: session!.user.name,
        email: session!.user.email,
        communicationStyle: athlete.communicationStyle ?? '',
        races: races.map((r) => ({
          id: r.id,
          name: r.name,
          date: r.date,
          distance: r.distance,
          isTarget: r.isTarget,
        })),
        pastRaces: pastRaces.map((r) => ({
          id: r.id,
          distance: r.distance,
          date: r.date,
          finishSeconds: r.finishSeconds,
          note: r.note,
        })),
        raceDistance: athlete.raceDistance ?? '',
        weeklySessionDay: athlete.profile?.weeklySessionDay ?? null,
        fixedConstraints: athlete.profile?.fixedConstraints ?? [],
      }}
      language={uiPrefs.language ?? locale}
      preferredName={uiPrefs.preferredName ?? ''}
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
      onAddRace={addRaceAction}
      onSetTargetRace={setTargetRaceAction}
      onRemoveRace={removeRaceAction}
      onAddPastRace={addPastRaceAction}
      onRemovePastRace={removePastRaceAction}
      onUpdateRaceDistance={updateRaceDistanceAction}
      onUpdateWeeklySessionDay={updateWeeklySessionDayAction}
      onAddFixedConstraint={addFixedConstraintAction}
      onRemoveFixedConstraint={removeFixedConstraintAction}
      onUpdateLanguage={updateLanguageAction}
      onUpdatePreferredName={updatePreferredNameAction}
      onSetLinkVisibility={updateLinkVisibilityAction}
      onSeverCoachingLink={severCoachingLinkAction}
      onDeleteAccount={deleteMyAccountAction}
    />
  );
}
