'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';
import { effectiveWeeklySessionDay } from '@/features/coach/weekly-offer';
import {
  coachSeesDay,
  commitDayChoice,
  commitDismissal,
  dayChoice,
  dayMessageKey,
  nextDraftDates,
  type DayChoice,
  type RaceFacts,
} from '@/features/coach/weekly-session-day';
import { dismissWeekCycleAction, setWeeklySessionDayAction } from './day-actions';

/**
 * The athlete's Weekly Session Day, stated as a fact and explained
 * (`training-architecture/28`; Mads's ruled card, 2026-09-18). Replaces the
 * seven-button row that wrote on every tap and said nothing about what the
 * day does.
 *
 * Always visible: whose day it is and which, the next two draft dates (the
 * coach's first, `HEAD_COACH_LEAD_DAYS` before the athlete's), a control for
 * changing the day, and a fold that walks the weekly cycle in four steps. The
 * copy carries no markup and names the AI coach as such: a Head Coach reading
 * this for the first time is not helped by bold words, and "the Coach" means
 * nothing to someone outside the project (Mads on the PR #102 preview). Every date and every
 * race fact is computed from the same arithmetic the draft runs on — never
 * typed into copy — so the card cannot disagree with the draft it describes.
 *
 * Changing the day is a deliberate step: the tiles sit behind a Change day
 * control, a tile proposes, a confirm line appears, and only Confirm calls the
 * action (`dayChoice` holds that rule as a pure function). The write is the
 * existing `weekly_session_day_set`, narrated once as before.
 *
 * `training-architecture/41`: a Head Coach who has never been instructed gets
 * the fold open with a Got it button — the cycle is the least intuitive thing
 * on the site and nobody had a reason to click a closed summary. It is taught
 * once per coach (the flag is on the user), and the fold stays as the permanent
 * reference afterwards.
 */

const DAYS: readonly string[] = ONBOARDING_OPTIONS.days;

/** `Tue 22 Sep` / `tir. 22. sep.` — the short form the calendar header uses. */
function shortDate(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${key}T00:00:00Z`),
  );
}

export function WeeklySessionDayCard({
  athleteId,
  value,
  todayKey,
  athleteName,
  race,
  locale,
  instructed,
  initialProposed = null,
  initialChanging = false,
}: {
  athleteId: string;
  value: string | null;
  todayKey: string;
  /** The Preferred Name, or null — the card then says "the athlete" (the ruling), never the account name. */
  athleteName: string | null;
  race: RaceFacts | null;
  locale: string;
  /** Whether this coach has already been shown the weekly cycle and dismissed it. */
  instructed: boolean;
  /** Test seam only: render the card mid-choice. Never passed by the page. */
  initialProposed?: string | null;
  /** Test seam only: render the card with the day picker already open. Never passed by the page. */
  initialChanging?: boolean;
}) {
  const t = useTranslations('CoachDay');
  const tDays = useTranslations('Settings');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<DayChoice>({ current: value, proposed: initialProposed, write: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [changing, setChanging] = useState(initialChanging);
  const [dismissed, setDismissed] = useState(false);

  const name = athleteName ?? t('theAthlete');
  const dates = nextDraftDates(todayKey, choice.current);
  const dayName = tDays(dayMessageKey(effectiveWeeklySessionDay(choice.current)));
  const coachDay = tDays(dayMessageKey(coachSeesDay(choice.current)));

  const confirm = () => {
    startTransition(async () => {
      setNotice(null);
      const { state, error } = await commitDayChoice(choice, (day) => setWeeklySessionDayAction(athleteId, day));
      setChoice(state);
      if (error) setNotice(t('error', { reason: error }));
      else {
        // The day is a fact again: the tiles fold away the moment one lands.
        setChanging(false);
        router.refresh();
      }
    });
  };

  const teaching = !instructed && !dismissed;

  const dismiss = () => {
    startTransition(async () => {
      setNotice(null);
      const { dismissed: done, error } = await commitDismissal(() => dismissWeekCycleAction(athleteId));
      setDismissed(done);
      if (error) setNotice(t('error', { reason: error }));
    });
  };

  const stepArgs = {
    name,
    coachDay,
    day: dayName,
    weekStart: shortDate(dates.weekStart, locale),
    weekEnd: shortDate(dates.weekEnd, locale),
  };

  return (
    <section className="w-full max-w-3xl border border-border bg-panel p-5 shadow-sm sm:p-6" data-weekly-session-day-card="">
      <h2 className="font-display text-2xl font-bold uppercase italic leading-tight tracking-[0.03em] text-foreground">{t('headline', { name, day: dayName })}</h2>
      <p className="mt-2 font-body text-base text-foreground">{t('intro', { name, day: dayName })}</p>
      <p className="mt-2 font-body text-sm text-muted-foreground">
        {t('nextDraft', {
          name,
          coachDate: shortDate(dates.coachSees, locale),
          athleteDate: shortDate(dates.athleteSees, locale),
        })}
      </p>

      {!changing ? (
        <button
          type="button"
          data-action="change-day"
          onClick={() => setChanging(true)}
          className="mt-3 rounded border border-border px-3 py-1 font-body text-sm text-foreground"
        >
          {t('changeDay')}
        </button>
      ) : (
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('pickerLabel')}>
        {DAYS.map((day) => {
          const isCurrent = choice.current === day;
          const isProposed = choice.proposed === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setChoice(dayChoice(choice, { type: 'tap', day }))}
              disabled={pending}
              aria-pressed={isCurrent}
              className={`inline-flex h-10 items-center border px-4 font-body text-[15px] font-medium transition-colors disabled:opacity-50 ${
                isCurrent
                  ? 'border-signal bg-signal text-signal-foreground'
                  : isProposed
                    ? 'border-foreground text-foreground'
                    : 'border-border text-muted-foreground'
              }`}
            >
              {tDays(dayMessageKey(day))}
            </button>
          );
        })}
      </div>
      )}

      {choice.proposed && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3" data-day-confirm="">
          <p className="font-body text-sm text-foreground">{t('confirmQuestion', { day: tDays(dayMessageKey(choice.proposed)) })}</p>
          <button
            type="button"
            data-action="confirm-day"
            onClick={confirm}
            disabled={pending}
            className="inline-flex h-11 items-center justify-center bg-signal px-5 font-body text-base font-semibold text-signal-foreground transition-colors hover:bg-signal/85 disabled:opacity-50"
          >
            {t('confirm')}
          </button>
          <button
            type="button"
            data-action="cancel-day"
            onClick={() => setChoice(dayChoice(choice, { type: 'cancel' }))}
            disabled={pending}
            className="inline-flex h-10 items-center border border-border px-4 font-body text-[15px] font-medium text-foreground transition-colors hover:border-signal hover:text-signal disabled:opacity-50"
          >
            {t('cancel')}
          </button>
        </div>
      )}
      {notice && <p className="mt-2 text-sm text-signal">{notice}</p>}

      <details className="mt-4" open={teaching}>
        <summary className="cursor-pointer font-body text-sm text-foreground underline">{t('howTitle')}</summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5 font-body text-sm text-foreground">
          <li>
            {race
              ? t('step1', { ...stepArgs, race: race.name, weeks: race.weeksOut, block: race.blockName ?? t('noBlock') })
              : t('step1NoRace', stepArgs)}
          </li>
          <li>{t('step2', stepArgs)}</li>
          <li>{t('step3', stepArgs)}</li>
          <li>{t('step4', stepArgs)}</li>
        </ol>
        <p className="mt-2 font-body text-sm text-muted-foreground">{t('changing')}</p>
        {teaching && (
          <button
            type="button"
            data-action="dismiss-week-cycle"
            onClick={dismiss}
            disabled={pending}
            className="mt-3 rounded border border-signal bg-signal px-3 py-1 text-sm text-signal-foreground disabled:opacity-50"
          >
            {t('gotIt')}
          </button>
        )}
      </details>
    </section>
  );
}
