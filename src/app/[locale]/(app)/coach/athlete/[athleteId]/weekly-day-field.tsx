'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';
import { setWeeklySessionDayAction, type SetDayActionResult } from './day-actions';

/**
 * The Head Coach's control over a linked athlete's Weekly Session Day
 * (`training-architecture/17`; ADR 0003 amendment 2026-09-14): the day next
 * week's proposal reaches the athlete, which is the day before the coach sees
 * it. Seven tiles, no "Flexible" — retired. The same tile look the athlete's
 * Settings use, so the field reads as the same thing seen from the other side.
 */

const DAYS = ONBOARDING_OPTIONS.days;
const DAY_KEYS = ['dayMonday', 'dayTuesday', 'dayWednesday', 'dayThursday', 'dayFriday', 'daySaturday', 'daySunday'] as const;

export function WeeklyDayField({ athleteId, value }: { athleteId: string; value: string | null }) {
  const t = useTranslations('CoachDay');
  const tDays = useTranslations('Settings');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);
  const [notice, setNotice] = useState<string | null>(null);

  const choose = (day: string) => {
    if (day === current) return;
    startTransition(async () => {
      setNotice(null);
      const result: SetDayActionResult = await setWeeklySessionDayAction(athleteId, day);
      if (result.ok) {
        setCurrent(day);
        router.refresh();
        return;
      }
      setNotice(t('error', { reason: result.reason }));
    });
  };

  return (
    <section className="w-full max-w-3xl rounded-lg border p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t('label')}</p>
      <p className="mt-1 font-body text-xs text-muted-foreground">{t('note')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {DAYS.map((day, i) => (
          <button
            key={day}
            type="button"
            onClick={() => choose(day)}
            disabled={pending}
            aria-pressed={current === day}
            className={`rounded border px-3 py-1 text-sm disabled:opacity-50 ${
              current === day ? 'border-signal bg-signal/10 text-foreground' : 'border-border text-muted-foreground'
            }`}
          >
            {tDays(DAY_KEYS[i])}
          </button>
        ))}
      </div>
      {notice && <p className="mt-2 text-sm text-red-600">{notice}</p>}
    </section>
  );
}
