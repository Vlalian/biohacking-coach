import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { effectiveWeeklySessionDay } from '@/features/coach/weekly-offer';
import { coachSeesDay, dayMessageKey } from '@/features/coach/weekly-session-day';

/**
 * The athlete's one line about their own cycle (`training-architecture/28`):
 * which evening the draft is written and which day it is shown, with the
 * decision that follows. The day itself is changed in Settings, so the line
 * points there rather than carrying a control.
 */

export function WeeklySessionDayLine({
  weeklySessionDay,
  headCoachName,
}: {
  weeklySessionDay: string | null | undefined;
  /**
   * The linked Head Coach's name, Preferred Name first, or null for a solo
   * athlete. While linked the day is the Head Coach's (ADR 0003, amended
   * 2026-09-14), so the line names them and drops the Settings pointer
   * (`training-architecture/42`).
   */
  headCoachName?: string | null;
}) {
  const t = useTranslations('WeeklySessionDayLine');
  const tDays = useTranslations('Settings');
  const day = tDays(dayMessageKey(effectiveWeeklySessionDay(weeklySessionDay)));
  if (headCoachName) {
    return (
      <p className="font-body text-sm text-muted-foreground" data-weekly-session-day-line="">
        {t('textLinked', { coach: headCoachName, day })}
      </p>
    );
  }
  const coachDay = tDays(dayMessageKey(coachSeesDay(weeklySessionDay)));
  return (
    <p className="font-body text-sm text-muted-foreground" data-weekly-session-day-line="">
      {t('text', { coachDay, day })}{' '}
      <Link href="/settings" className="underline">
        {t('change')}
      </Link>
    </p>
  );
}
