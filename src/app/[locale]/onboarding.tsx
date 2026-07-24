'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  ONBOARDING_OPTIONS,
  type OnboardingAnswers,
  type OnboardingStepId,
  type StepAnswer,
} from '@/features/onboarding/onboarding-flow';
import { answerOnboardingAction } from './onboarding-actions';

/**
 * MCQ onboarding, Coach-voice-only (ADR 0001): every question is the Coach
 * talking — no wizard chrome beyond a step counter, no mascots, no tooltips.
 *
 * The flow is the POC's question set: language → experience → race → adaptive
 * (per level) → constraints. Answers persist server-side step by step, so a
 * refresh resumes at the first unanswered step (`initial` carries that state).
 * Choosing Dansk switches the next-intl locale immediately — the UI re-renders
 * in Danish and the Coach's language preference is stored with the user — and
 * touches nothing else.
 */

export interface OnboardingInitial {
  step: OnboardingStepId;
  answers: OnboardingAnswers;
}

type UiState = {
  step: OnboardingStepId | 'done';
  answers: OnboardingAnswers;
  greeting: string | null;
};

const BTN =
  'rounded border border-neutral-300 px-3 py-2 text-left text-sm hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-400';
const BTN_ON = 'rounded border px-3 py-2 text-left text-sm border-amber-600 text-amber-700 dark:text-amber-400';
const PRIMARY =
  'rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';
const LABEL = 'text-xs font-semibold uppercase tracking-wide text-neutral-500';
const INPUT =
  'w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950';

const DAY_KEYS = [
  'dayMonday',
  'dayTuesday',
  'dayWednesday',
  'dayThursday',
  'dayFriday',
  'daySaturday',
  'daySunday',
] as const;
// One source for every option set: the validation module. The UI only maps
// values to labels — it can never offer a value the server would refuse.
const DAYS = ONBOARDING_OPTIONS.days;

const OPT_KEY: Record<string, string> = {
  Runner: 'optRunner',
  Cyclist: 'optCyclist',
  Swimmer: 'optSwimmer',
  Gym: 'optGym',
  None: 'optNone',
  'Under 3h': 'optUnder3',
  '3–6h': 'opt36',
  '6–10h': 'opt610',
  '10h+': 'opt10plus',
  Completion: 'optCompletion',
  'Personal challenge': 'optChallenge',
  Community: 'optCommunity',
  Performance: 'optPerformance',
  Swim: 'optSwim',
  Bike: 'optBike',
  Run: 'optRun',
  Equal: 'optEqual',
  Yes: 'optYes',
  No: 'optNo',
  'Heart Rate': 'optHR',
  Power: 'optPower',
  HRV: 'optHRV',
  Pace: 'optPace',
  Flexible: 'optFlexible',
};

/** Toggle a value in a multi-select; picking the "None" option clears the rest. */
function toggleMulti(arr: string[], value: string, noneKey: string | null): string[] {
  if (noneKey !== null && value === noneKey) {
    return arr.includes(noneKey) ? [] : [noneKey];
  }
  const filtered = arr.filter((v) => v !== noneKey);
  const idx = filtered.indexOf(value);
  if (idx === -1) return [...filtered, value];
  return filtered.filter((v) => v !== value);
}

export function OnboardingFlow({ initial }: { initial: OnboardingInitial }) {
  const t = useTranslations('Onboarding');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const [state, setState] = useState<UiState>({
    step: initial.step,
    answers: initial.answers,
    greeting: null,
  });

  // Local drafts for the in-progress step.
  const [race, setRace] = useState('');
  const [sportBackground, setSportBackground] = useState<string[]>([]);
  const [weeklyHours, setWeeklyHours] = useState('');
  const [motivation, setMotivation] = useState('');
  const [bestTime, setBestTime] = useState('');
  const [weakestDiscipline, setWeakestDiscipline] = useState<string[]>([]);
  const [hasHumanCoach, setHasHumanCoach] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [trackedMetrics, setTrackedMetrics] = useState<string[]>([]);
  const [fixedConstraints, setFixedConstraints] = useState<string[]>([]);
  const [weeklySessionDay, setWeeklySessionDay] = useState('');

  const STEP_NUMBER: Record<OnboardingStepId, number> = {
    language: 1,
    experience: 2,
    race: 3,
    adaptive: 4,
    constraints: 5,
  };

  function submit(payload: StepAnswer, after?: () => void) {
    setError(false);
    startTransition(async () => {
      const result = await answerOnboardingAction(payload);
      if (!result.ok) {
        setError(true);
        return;
      }
      // The personalized greeting exists only in this response — the persisted
      // transcript stays name-free (ADR 0006). Fall back to the stored line.
      const lastCoach = [...result.messages]
        .reverse()
        .find((m) => m.role === 'coach_ai');
      setState({
        step: result.step,
        answers: result.answers,
        greeting:
          result.step === 'done'
            ? ('displayGreeting' in result ? result.displayGreeting : undefined) ??
              lastCoach?.content ??
              null
            : null,
      });
      after?.();
    });
  }

  function chooseLanguage(language: string) {
    // Persist first, then flip the locale — the URL change re-renders the whole
    // UI in the chosen language at once.
    submit({ step: 'language', language }, () => {
      router.replace(pathname, { locale: language });
    });
  }

  // aria-pressed, not just a colour swap: selection is the whole content of an
  // MCQ answer, and a border change conveys nothing to a screen reader.
  const optBtn = (value: string, selected: boolean, onClick: () => void) => (
    <button
      key={value}
      type="button"
      aria-pressed={selected}
      disabled={pending}
      onClick={onClick}
      className={selected ? BTN_ON : BTN}
    >
      {t(OPT_KEY[value] ?? value)}
    </button>
  );

  return (
    <section className="flex w-full max-w-lg flex-col gap-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-500">
        {t('coachLabel')}
      </div>

      {state.step !== 'done' && (
        <div className="text-xs text-neutral-500">
          {t('stepOf', { step: STEP_NUMBER[state.step], total: 5 })}
        </div>
      )}

      {state.step === 'language' && (
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium">{t('qLanguage')}</p>
          <div className="flex gap-3">
            <button type="button" disabled={pending} className={BTN} onClick={() => chooseLanguage('en')}>
              English
            </button>
            <button type="button" disabled={pending} className={BTN} onClick={() => chooseLanguage('da')}>
              Dansk
            </button>
          </div>
        </div>
      )}

      {state.step === 'experience' && (
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium">{t('qExperience')}</p>
          <p className="text-xs text-neutral-500">{t('qExperienceSub')}</p>
          <div className="flex flex-col gap-2">
            {(
              [
                ['beginner', 'expBeginner'],
                ['intermediate', 'expIntermediate'],
                ['veteran', 'expVeteran'],
              ] as const
            ).map(([value, key]) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                className={BTN}
                onClick={() => submit({ step: 'experience', experienceLevel: value })}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.step === 'race' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (race.trim()) submit({ step: 'race', raceTarget: race.trim() });
          }}
        >
          <p className="text-base font-medium">{t('qRace')}</p>
          <p className="text-xs text-neutral-500">{t('qRaceSub')}</p>
          <label htmlFor="onboarding-race" className="sr-only">
            {t('qRace')}
          </label>
          <input
            id="onboarding-race"
            value={race}
            onChange={(e) => setRace(e.target.value)}
            placeholder={t('racePlaceholder')}
            disabled={pending}
            className={INPUT}
          />
          <button type="submit" disabled={pending || !race.trim()} className={PRIMARY}>
            {t('continue')}
          </button>
        </form>
      )}

      {state.step === 'adaptive' && (
        <div className="flex flex-col gap-4">
          <p className="text-base font-medium">{t('qAdaptive')}</p>

          {state.answers.experienceLevel === 'beginner' && (
            <>
              <div className="flex flex-col gap-2">
                <span className={LABEL}>
                  {t('sportBg')} <span className="font-normal normal-case">{t('optionalMulti')}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {ONBOARDING_OPTIONS.sportBackground.map((o) =>
                    optBtn(o, sportBackground.includes(o), () =>
                      setSportBackground((a) => toggleMulti(a, o, 'None')),
                    ),
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className={LABEL}>
                  {t('weeklyHours')} <span className="font-normal normal-case">{t('optional')}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {ONBOARDING_OPTIONS.weeklyHours.map((o) =>
                    optBtn(o, weeklyHours === o, () => setWeeklyHours(weeklyHours === o ? '' : o)),
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className={LABEL}>
                  {t('motivation')} <span className="font-normal normal-case">{t('optional')}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {ONBOARDING_OPTIONS.motivation.map((o) =>
                    optBtn(o, motivation === o, () => setMotivation(motivation === o ? '' : o)),
                  )}
                </div>
              </div>
            </>
          )}

          {state.answers.experienceLevel === 'intermediate' && (
            <>
              <div className="flex flex-col gap-2">
                <label className={LABEL} htmlFor="onboarding-best-time">
                  {t('bestTime')} <span className="font-normal normal-case">{t('optional')}</span>
                </label>
                <input
                  id="onboarding-best-time"
                  value={bestTime}
                  onChange={(e) => setBestTime(e.target.value)}
                  placeholder={t('bestTimePlaceholder')}
                  disabled={pending}
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className={LABEL}>
                  {t('weakest')} <span className="font-normal normal-case">{t('optionalMulti')}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {ONBOARDING_OPTIONS.weakestDiscipline.map((o) =>
                    optBtn(o, weakestDiscipline.includes(o), () =>
                      setWeakestDiscipline((a) => toggleMulti(a, o, null)),
                    ),
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className={LABEL}>{t('humanCoach')}</span>
                <div className="flex flex-wrap gap-2">
                  {ONBOARDING_OPTIONS.hasHumanCoach.map((o) =>
                    optBtn(o, hasHumanCoach === o, () => setHasHumanCoach(hasHumanCoach === o ? '' : o)),
                  )}
                </div>
              </div>
            </>
          )}

          {state.answers.experienceLevel === 'veteran' && (
            <>
              <div className="flex flex-col gap-2">
                <label className={LABEL} htmlFor="onboarding-target-time">
                  {t('targetTime')} <span className="font-normal normal-case">{t('optional')}</span>
                </label>
                <input
                  id="onboarding-target-time"
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  placeholder={t('targetTimePlaceholder')}
                  disabled={pending}
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className={LABEL}>
                  {t('metrics')} <span className="font-normal normal-case">{t('optionalMulti')}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {ONBOARDING_OPTIONS.trackedMetrics.map((o) =>
                    optBtn(o, trackedMetrics.includes(o), () =>
                      setTrackedMetrics((a) => toggleMulti(a, o, 'None')),
                    ),
                  )}
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            disabled={pending}
            className={PRIMARY}
            onClick={() =>
              submit({
                step: 'adaptive',
                sportBackground: sportBackground.length > 0 ? sportBackground : undefined,
                weeklyHours: weeklyHours || undefined,
                motivation: motivation || undefined,
                bestTime: bestTime || undefined,
                weakestDiscipline: weakestDiscipline.length > 0 ? weakestDiscipline : undefined,
                hasHumanCoach: hasHumanCoach || undefined,
                targetTime: targetTime || undefined,
                trackedMetrics: trackedMetrics.length > 0 ? trackedMetrics : undefined,
              })
            }
          >
            {t('continue')}
          </button>
        </div>
      )}

      {state.step === 'constraints' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-base font-medium">{t('qConstraints')}</p>
            <p className="text-xs text-neutral-500">{t('qConstraintsSub')}</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={fixedConstraints.includes(d)}
                  disabled={pending}
                  className={fixedConstraints.includes(d) ? BTN_ON : BTN}
                  onClick={() => setFixedConstraints((a) => toggleMulti(a, d, null))}
                >
                  {t(DAY_KEYS[i])}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-base font-medium">{t('weeklyDay')}</p>
            <p className="text-xs text-neutral-500">{t('weeklyDaySub')}</p>
            <div className="flex flex-wrap gap-2">
              {ONBOARDING_OPTIONS.weeklySessionDay.map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={weeklySessionDay === o}
                  disabled={pending}
                  className={weeklySessionDay === o ? BTN_ON : BTN}
                  onClick={() => setWeeklySessionDay(weeklySessionDay === o ? '' : o)}
                >
                  {o === 'Flexible' ? t('optFlexible') : t(DAY_KEYS[DAYS.indexOf(o)])}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            className={PRIMARY}
            onClick={() =>
              submit({
                step: 'constraints',
                fixedConstraints,
                weeklySessionDay: weeklySessionDay || undefined,
              })
            }
          >
            {t('finish')}
          </button>
        </div>
      )}

      {state.step === 'done' && (
        <div className="flex flex-col gap-4">
          <p className="whitespace-pre-wrap text-base leading-relaxed">{state.greeting}</p>
          <button type="button" className={PRIMARY} onClick={() => router.refresh()}>
            {t('startTraining')}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t('error')}
        </p>
      )}
    </section>
  );
}
