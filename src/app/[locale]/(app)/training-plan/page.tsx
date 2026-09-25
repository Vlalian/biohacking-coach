import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { timed } from '@/lib/render-timing';
import { getCurrentAthlete, getCurrentSession } from '../current-user';
import { getSessionsForAthlete } from '@/features/session/session-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { getHealthHistory } from '@/features/health/health-repository';
import { spansFrom } from '@/features/health/health-layer';
import { daysBetween, today } from '@/lib/date';
import { logBlockAdjustmentFailure } from '@/lib/coach-log';
import { ensureBlocksAdjusted, getResolvedBlocks } from '@/features/coach/training-block-service';
import { blockPosition, currentBlock } from '@/features/coach/training-blocks';
import { calendarSlotState } from '@/features/coach/week-draft-service';
import { BlockStrip } from '../../block-strip';
import { WeeklySessionDayLine } from '../../weekly-session-day-line';
import { Calendar } from '../../calendar';
import { GarminUpload } from '../../garmin-upload';
import { DetectedActivities } from '../../detected-activities';
import {
  listPendingActivities,
  listImportedSessionIds,
} from '@/features/garmin/detected-activity';

// Read per-request: the page depends on who is signed in, so it can never be
// prerendered. Signed out, it is not a page at all — it redirects to sign-in.
export const dynamic = 'force-dynamic';

/**
 * Every read the calendar needs, together (`code-health/09`): none depends on
 * another, only on the athlete, so they share one round of waiting instead of
 * seven in a row.
 */
function readCalendar(athleteId: string, todayKey: string) {
  return Promise.all([
    // The athlete's own training sessions, scoped to their id — the
    // query cannot return anyone else's rows (ADR 0006).
    getSessionsForAthlete(athleteId),
    // Their Unavailable Dates: day markers and the mark/clear affordance.
    getUnavailableDates(athleteId),
    // Uploaded activities not accepted yet. Deliberately not part of
    // `trainingSessions` — a proposal is not in the training record until
    // the athlete's Reflection commits it (CONTEXT.md, Detected Activity).
    listPendingActivities(athleteId),
    // Which sessions were completed by accepting one. Only these offer an
    // undo — completing is otherwise one-directional (session-status-rules.ts).
    listImportedSessionIds(athleteId),
    // The Training Blocks — the Coach-shaped set when one exists, the
    // arithmetic draft when not (`training-architecture/07`). Same
    // resolver the Coach's own prompts read, so the strip and the Coach
    // never disagree.
    getResolvedBlocks(athleteId, todayKey),
    // The week the Coach drafted, if one waits for the athlete's decision
    // — or a pointer to the conversation it moved into (training-architecture/18),
    // or that the draft is being written right now by the shell's after()
    // (29). Read with today as `asOf`: a linked Head Coach's day-early
    // preview is not the athlete's to see yet (17).
    calendarSlotState(athleteId, todayKey),
    // Injuries and Illnesses, open and closed, drawn as a layer beside
    // the plan (training-architecture/06). Their own rows only.
    getHealthHistory(athleteId).then((h) => spansFrom(h.injuries, h.illnesses)),
  ]);
}

/** What a signed-in user with no athlete row sees: an empty calendar, nothing read. */
const NO_ATHLETE: Awaited<ReturnType<typeof readCalendar>> = [
  [],
  [],
  [],
  [],
  { race: null, set: null, blocks: [] },
  null,
  [],
];

/**
 * Training Plan — the default View (ADR 0007). The calendar plus the Detected
 * Activity upload that feeds it. The Weekly Session/Coach Chat conversation
 * that used to render inline here now lives in the Coach Overlay, hosted by
 * the shared (app) layout so it follows the athlete across every View.
 */
export default async function TrainingPlanPage({
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

  const athlete = await getCurrentAthlete();
  const todayKey = today();

  const [
    trainingSessions,
    unavailableDates,
    pendingActivities,
    importedSessionIds,
    horizon,
    proposal,
    health,
  ] = await timed('plan.reads', () =>
    athlete ? readCalendar(athlete.id, todayKey) : Promise.resolve(NO_ATHLETE),
  );

  // The two lines under the month: the block and the race, from the same
  // resolved horizon the strip and the Coach read, so none of them disagree.
  const block = horizon.race ? currentBlock(todayKey, horizon.blocks) : null;
  const phase =
    horizon.race && block
      ? {
          blockName: block.name,
          ...blockPosition(todayKey, block),
          raceName: horizon.race.name,
          daysToRace: Math.max(0, daysBetween(todayKey, horizon.race.date)),
        }
      : null;

  // Stage 2 runs here, **after the response is sent**. The page renders now;
  // the ~20 s Coach call runs once the athlete has their calendar, and the next
  // navigation shows the result with the narration firing from the shell. The
  // service is idempotent and cheap on the common path (two reads, then
  // nothing), so hanging it off the default View costs the athlete no wait and
  // covers every tester who already has a race. Never on a render path, never
  // thrown: a failure here is logged and the athlete stays on the draft.
  if (athlete) {
    const athleteId = athlete.id;
    after(async () => {
      try {
        await ensureBlocksAdjusted(athleteId, todayKey);
      } catch (error) {
        logBlockAdjustmentFailure(athleteId, error);
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col items-center gap-6 px-4 py-6 lg:px-8 lg:py-8">
      <BlockStrip
        todayKey={todayKey}
        race={horizon.race ? { name: horizon.race.name, date: horizon.race.date } : null}
        blocks={horizon.blocks}
      />
      {/* One line on the athlete's own cycle (training-architecture/28); the day is changed in Settings. */}
      {athlete && <WeeklySessionDayLine weeklySessionDay={athlete.profile?.weeklySessionDay} />}
      <Calendar
        sessions={trainingSessions}
        unavailableDates={unavailableDates}
        importedSessionIds={importedSessionIds}
        todayKey={todayKey}
        proposal={proposal}
        health={health}
        phase={phase}
      />
      <DetectedActivities activities={pendingActivities} locale={locale} />
      <GarminUpload />
    </div>
  );
}
