import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { getSessionsForAthlete } from '@/features/session/session-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { getHealthHistory } from '@/features/health/health-repository';
import { spansFrom } from '@/features/health/health-layer';
import { today } from '@/lib/date';
import { logBlockAdjustmentFailure } from '@/lib/coach-log';
import { ensureBlocksAdjusted, getResolvedBlocks } from '@/features/coach/training-block-service';
import { calendarSlotState } from '@/features/coach/week-draft-service';
import { BlockStrip } from '../../block-strip';
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

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  const athlete = await getAthleteByUserId(session!.user.id);

  // Read the athlete's own training sessions, scoped to their id — the query
  // cannot return anyone else's rows (ADR 0006).
  const trainingSessions = athlete ? await getSessionsForAthlete(athlete.id) : [];

  // The athlete's Unavailable Dates, scoped to their id like the sessions —
  // rendered as day markers and the source of the mark/clear affordance.
  const unavailableDates = athlete ? await getUnavailableDates(athlete.id) : [];

  // Uploaded activities that have not been accepted yet. They are deliberately
  // not part of `trainingSessions` — a proposal is not in the training record
  // until the athlete's Reflection commits it (CONTEXT.md, Detected Activity).
  const pendingActivities = athlete ? await listPendingActivities(athlete.id) : [];

  // Which sessions were completed by accepting one. Only these offer an undo —
  // completing is otherwise one-directional (session-status-rules.ts).
  const importedSessionIds = athlete ? await listImportedSessionIds(athlete.id) : [];

  const todayKey = today();

  // The athlete's Training Blocks — the Coach-shaped set when one exists, the
  // arithmetic draft when not (`training-architecture/07`). Same resolver the
  // Coach's own prompts read, so the strip and the Coach never disagree.
  const horizon = athlete ? await getResolvedBlocks(athlete.id, todayKey) : { race: null, blocks: [] };

  // The week the Coach drafted, if one is waiting for the athlete's decision —
  // or a pointer to the conversation it moved into (training-architecture/18),
  // or that the draft is being written right now, by the shell's after() this
  // same request (29). Read with today as `asOf`: a linked Head Coach's
  // day-early preview is not the athlete's to see yet (17).
  const proposal = athlete ? await calendarSlotState(athlete.id, todayKey) : null;

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
  // The athlete's Injuries and Illnesses, open and closed, drawn as a layer
  // beside the plan (training-architecture/06). Their own rows only.
  const health = athlete
    ? await getHealthHistory(athlete.id).then((h) => spansFrom(h.injuries, h.illnesses))
    : [];

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <BlockStrip
        todayKey={todayKey}
        race={horizon.race ? { name: horizon.race.name, date: horizon.race.date } : null}
        blocks={horizon.blocks}
      />
      <Calendar
        sessions={trainingSessions}
        unavailableDates={unavailableDates}
        importedSessionIds={importedSessionIds}
        todayKey={todayKey}
        proposal={proposal}
        health={health}
      />
      <DetectedActivities activities={pendingActivities} locale={locale} />
      <GarminUpload />
    </div>
  );
}
