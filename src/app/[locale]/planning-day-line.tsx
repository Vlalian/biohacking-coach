import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';
import { effectiveWeeklySessionDay } from '@/features/coach/weekly-offer';

/**
 * The athlete's one line about their own cycle (`training-architecture/28`):
 * which evening the draft is written and which day it is shown, with the
 * decision that follows. The day itself is changed in Settings, so the line
 * points there rather than carrying a control.
 */

const DAYS: readonly string[] = ONBOARDING_OPTIONS.days;
const DAY_KEYS = ['dayMonday', 'dayTuesday', 'dayWednesday', 'dayThursday', 'dayFriday', 'daySaturday', 'daySunday'] as const;

export function PlanningDayLine({ weeklySessionDay }: { weeklySessionDay: string | null | undefined }) {
  const t = useTranslations('PlanningDayLine');
  const tDays = useTranslations('Settings');
  const index = DAYS.indexOf(effectiveWeeklySessionDay(weeklySessionDay));
  const day = tDays(DAY_KEYS[index]);
  const coachDay = tDays(DAY_KEYS[(index + 6) % 7]);
  return (
    <p className="font-body text-sm text-muted-foreground" data-planning-day-line="">
      {t('text', { coachDay, day })}{' '}
      <Link href="/settings" className="underline">
        {t('change')}
      </Link>
    </p>
  );
}
