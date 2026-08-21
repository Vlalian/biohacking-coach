import { InformationView } from '@/app/[locale]/(app)/information/information-view';
import { parseLayout } from '@/features/information-view/layout';
import { PANEL_IDS } from '@/features/information-view/panels';
import { loadCoachAthlete, NotACoach } from '../coach-athlete-guard';
import { saveCoachLayoutAction } from '../coach-layout-actions';

// Per-request: depends on the signed-in coach and the requested athlete.
export const dynamic = 'force-dynamic';

/**
 * The athlete's data, through the same Information View the athlete uses,
 * rendered with Head Coach permissions and gated by Link Visibility upstream —
 * a section the athlete does not share produces no panels here.
 */
export default async function CoachAthleteInformationPage({
  params,
}: {
  params: Promise<{ locale: string; athleteId: string }>;
}) {
  const { locale, athleteId } = await params;
  const context = await loadCoachAthlete(locale, athleteId);
  if (!context.ok) return <NotACoach />;

  // The coach's ONE roster-wide layout (ADR 0004). Edits persist to the coach
  // row, not the athlete's — the save action resolves the coach from the
  // session, so favorites set here follow them across the roster.
  const layout = parseLayout(context.coach.informationViewLayout, PANEL_IDS);

  return (
    <InformationView
      dataset={context.view.dataset}
      initialLayout={layout}
      saveLayout={saveCoachLayoutAction}
    />
  );
}
