'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';
import { effectiveWeeklySessionDay } from '@/features/coach/weekly-offer';
import { dayChoice, nextDraftDates, type DayChoice, type RaceFacts } from '@/features/coach/planning-day';
import { setWeeklySessionDayAction, type SetDayActionResult } from './day-actions';

/**
 * The athlete's Weekly Session Day, stated as a fact and explained
 * (`training-architecture/28`; Mads's ruled card, 2026-09-18). Replaces the
 * seven-button row that wrote on every tap and said nothing about what the
 * day does.
 *
 * Always visible: whose day it is and which, the next two draft dates (the
 * coach's first, `HEAD_COACH_LEAD_DAYS` before the athlete's), the seven tiles,
 * and a fold that walks the weekly cycle in four steps. Every date and every
 * race fact is computed from the same arithmetic the draft runs on — never
 * typed into copy — so the card cannot disagree with the draft it describes.
 *
 * Changing the day is a deliberate step: a tile proposes, a confirm line
 * appears, and only Confirm calls the action (`dayChoice` holds that rule as a
 * pure function). The write is the existing `weekly_session_day_set`, narrated
 * once as before.
 */

const DAYS: readonly string[] = ONBOARDING_OPTIONS.days;
const DAY_KEYS = ['dayMonday', 'dayTuesday', 'dayWednesday', 'dayThursday', 'dayFriday', 'daySaturday', 'daySunday'] as const;

function dayKeyOf(day: string): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[DAYS.indexOf(day)] ?? 'daySunday';
}

/** `Tue 22 Sep` / `tir. 22. sep.` — the short form the calendar header uses. */
function shortDate(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${key}T00:00:00Z`),
  );
}

export function PlanningDayCard({
  athleteId,
  value,
  todayKey,
  athleteName,
  race,
  locale,
  initialProposed = null,
}: {
  athleteId: string;
  value: string | null;
  todayKey: string;
  athleteName: string;
  race: RaceFacts | null;
  locale: string;
  /** Test seam only: render the card mid-choice. Never passed by the page. */
  initialProposed?: string | null;
}) {
  const t = useTranslations('CoachDay');
  const tDays = useTranslations('Settings');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<DayChoice>({ current: value, proposed: initialProposed, write: null });
  const [notice, setNotice] = useState<string | null>(null);

  const effective = effectiveWeeklySessionDay(choice.current);
  const dates = nextDraftDates(todayKey, choice.current);
  const dayName = tDays(dayKeyOf(effective));
  const coachDay = tDays(dayKeyOf(DAYS[(DAYS.indexOf(effective) + 6) % 7]));

  const confirm = () => {
    const next = dayChoice(choice, { type: 'confirm' });
    if (!next.write) return;
    setChoice(next);
    startTransition(async () => {
      setNotice(null);
      const result: SetDayActionResult = await setWeeklySessionDayAction(athleteId, next.write!);
      if (result.ok) {
        setChoice(dayChoice(next, { type: 'written' }));
        router.refresh();
        return;
      }
      setChoice(dayChoice(next, { type: 'cancel' }));
      setNotice(t('error', { reason: result.reason }));
    });
  };

  const stepArgs = {
    name: athleteName,
    coachDay,
    day: dayName,
    weekStart: shortDate(dates.weekStart, locale),
    weekEnd: shortDate(dates.weekEnd, locale),
  };

  return (
    <section className="w-full max-w-3xl rounded-lg border p-4" data-planning-day-card="">
      <h2 className="font-display text-lg leading-tight text-foreground">{t('headline', { name: athleteName, day: dayName })}</h2>
      <p className="mt-1 font-body text-sm text-foreground">{t('intro', { name: athleteName, day: dayName })}</p>
      <p className="mt-2 font-body text-sm text-muted-foreground">
        {t('nextDraft', {
          name: athleteName,
          coachDate: shortDate(dates.coachSees, locale),
          athleteDate: shortDate(dates.athleteSees, locale),
        })}
      </p>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('pickerLabel')}>
        {DAYS.map((day, i) => {
          const isCurrent = choice.current === day;
          const isProposed = choice.proposed === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setChoice(dayChoice(choice, { type: 'tap', day }))}
              disabled={pending}
              aria-pressed={isCurrent}
              className={`rounded border px-3 py-1 text-sm disabled:opacity-50 ${
                isCurrent
                  ? 'border-signal bg-signal/10 text-foreground'
                  : isProposed
                    ? 'border-foreground text-foreground'
                    : 'border-border text-muted-foreground'
              }`}
            >
              {tDays(DAY_KEYS[i])}
            </button>
          );
        })}
      </div>

      {choice.proposed && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3" data-day-confirm="">
          <p className="font-body text-sm text-foreground">{t('confirmQuestion', { day: tDays(dayKeyOf(choice.proposed)) })}</p>
          <button
            type="button"
            data-action="confirm-day"
            onClick={confirm}
            disabled={pending}
            className="rounded border border-signal bg-signal px-3 py-1 text-sm text-signal-foreground disabled:opacity-50"
          >
            {t('confirm')}
          </button>
          <button
            type="button"
            data-action="cancel-day"
            onClick={() => setChoice(dayChoice(choice, { type: 'cancel' }))}
            disabled={pending}
            className="rounded border border-border px-3 py-1 text-sm text-foreground disabled:opacity-50"
          >
            {t('cancel')}
          </button>
        </div>
      )}
      {notice && <p className="mt-2 text-sm text-signal">{notice}</p>}

      <details className="mt-4">
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
      </details>
    </section>
  );
}
