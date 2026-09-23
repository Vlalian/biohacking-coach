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

export function WeeklySessionDayLine({ weeklySessionDay }: { weeklySessionDay: string | null | undefined }) {
  const t = useTranslations('WeeklySessionDayLine');
  const tDays = useTranslations('Settings');
  const day = tDays(dayMessageKey(effectiveWeeklySessionDay(weeklySessionDay)));
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
