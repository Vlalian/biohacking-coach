import { updateHoursPerWeek } from '@/features/athlete/athlete-repository';
import { getSessionsForWeek } from '@/features/session/session-repository';
import { addDays, weekStartOf } from '@/lib/date';
import { previewRefill, refillWeeksFromHours } from './block-fill-service';
import { draftingWeek, hoursChangePreview, type HoursChangePreview, type StartFrom } from './hours-change';
import { hasCoachPlannedSession, visibleTo, type WeekDraft } from './week-draft';
import { getPendingWeekDraft, recordHoursChanged, withdrawWeekDraft } from './week-draft-repository';
import { draftInFlight } from './week-draft-service';

/**
 * An hours change asks when it applies (showable-version/61) — the reads and
 * writes around the pure {@link hoursChangePreview}.
 */

/**
 * The nearest undecided draft for an upcoming week: next week, or the week
 * after (a cycle anchored a day early can be due then — `withdrawPreviewDrafts`
 * looks as far). No `asOf`, so a draft still in a Head Coach's preview counts.
 */
async function waitingDraft(athleteId: string, today: string): Promise<WeekDraft | null> {
  const next = addDays(weekStartOf(today), 7);
  return (await getPendingWeekDraft(athleteId, next)) ?? (await getPendingWeekDraft(athleteId, addDays(next, 7)));
}

/** What the confirm dialog should ask, read before the athlete confirms. Writes nothing. */
export async function previewHoursChange(athleteId: string, today: string): Promise<HoursChangePreview> {
  const next = addDays(weekStartOf(today), 7);
  const [weeks, inFlight, waiting, nextWeek] = await Promise.all([
    previewRefill(athleteId, today),
    draftInFlight(athleteId, today),
    waitingDraft(athleteId, today),
    getSessionsForWeek(athleteId, next),
  ]);
  return hoursChangePreview({
    today,
    weeks,
    inFlightWeek: inFlight?.weekStart ?? null,
    waiting,
    nextWeekPlanned: hasCoachPlannedSession(nextWeek),
  });
}

/**
 * Stores the new hours and redraws the upcoming weeks they shape.
 *
 * With a waiting draft the athlete can see and `startFrom: 'waiting-week'`, that
 * week is redrawn with the rest and its draft withdrawn; `redraft` names it so
 * the caller drafts it again at once. Otherwise the waiting week is kept as it
 * is and recorded, so declining its draft later moves it to the new hours too.
 * A draft still in a linked Head Coach's preview is always kept, whatever the
 * client asked: the coach's work is never thrown away. So is a week Momentum is
 * drafting right now: the change starts the week after it, and declining that
 * draft once it lands moves the week to the new hours (review of 61, Mads
 * 2026-11-02).
 */
export async function applyHoursChange(
  athleteId: string,
  hours: number,
  startFrom: StartFrom,
  today: string,
): Promise<{ redrawn: string[]; redraft: string | null }> {
  await updateHoursPerWeek(athleteId, hours);
  const waiting = await waitingDraft(athleteId, today);

  if (!waiting) return withNoWaitingDraft(athleteId, hours, today);

  if (startFrom === 'waiting-week' && visibleTo(waiting, today)) {
    const { weeks } = await refillWeeksFromHours(athleteId, today);
    await withdrawWeekDraft(athleteId, waiting, 'hours-changed');
    return finish(athleteId, hours, weeks, null, waiting.weekStart);
  }

  const { weeks } = await refillWeeksFromHours(athleteId, today, { except: waiting.weekStart });
  return finish(athleteId, hours, weeks, waiting.weekStart, null);
}

/** No undecided draft: a week Momentum is drafting right now is kept, as a waiting one would be. */
async function withNoWaitingDraft(athleteId: string, hours: number, today: string) {
  const kept = draftingWeek((await draftInFlight(athleteId, today))?.weekStart ?? null, today);
  const { weeks } = kept ? await refillWeeksFromHours(athleteId, today, { except: kept }) : await refillWeeksFromHours(athleteId, today);
  return finish(athleteId, hours, weeks, kept, null);
}

async function finish(athleteId: string, hours: number, redrawn: string[], keptWeek: string | null, redraft: string | null) {
  await recordHoursChanged(athleteId, { hours, keptWeek });
  return { redrawn, redraft };
}
