'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { AlertTriangle, ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  ONBOARDING_OPTIONS,
  OPTION_MESSAGE_KEY,
  type LabelledOption,
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
 *
 * Visual language ported from the Lovable design (iron-insight-grid,
 * onboarding-session brief): race-bib header with a step progress rail,
 * bordered option tiles, and the climax hand-off screen. The Lovable brief
 * assumed an identity step and a history-upload step that don't exist in this
 * flow — the athlete's name already lives on the auth user (ADR 0006) and
 * upload is its own feature reachable from the Training Plan — so this port
 * carries the *look*, not those steps: no Back control either, since the real
 * flow persists step by step server-side and has no "unsubmit".
 */

export interface OnboardingInitial {
  step: OnboardingStepId;
  answers: OnboardingAnswers;
}

type UiState = {
  step: OnboardingStepId | 'done';
  answers: OnboardingAnswers;
  /** Populated only on completion; two parts so the climax screen can give the
   *  headline and the message their own visual weight (see Handoff below). */
  greeting: { intro: string; body: string } | null;
};

const STEPS: OnboardingStepId[] = ['language', 'experience', 'race', 'adaptive', 'constraints'];

const STEP_LABEL_KEY: Record<OnboardingStepId, string> = {
  language: 'stepLanguage',
  experience: 'stepExperience',
  race: 'stepRace',
  adaptive: 'stepAdaptive',
  constraints: 'stepConstraints',
};

// One source for every option set: the validation module. The UI only maps
// values to labels — it can never offer a value the server would refuse.
const DAYS = ONBOARDING_OPTIONS.days;


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
  const [availableHours, setAvailableHours] = useState('');
  const [motivation, setMotivation] = useState('');
  const [bestTime, setBestTime] = useState('');
  const [weakestDiscipline, setWeakestDiscipline] = useState<string[]>([]);
  const [hasHumanCoach, setHasHumanCoach] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [trackedMetrics, setTrackedMetrics] = useState<string[]>([]);
  const [fixedConstraints, setFixedConstraints] = useState<string[]>([]);
  const [weeklySessionDay, setWeeklySessionDay] = useState('');

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
      const lastCoach = [...result.messages].reverse().find((m) => m.role === 'coach_ai');
      setState({
        step: result.step,
        answers: result.answers,
        greeting:
          result.step === 'done'
            ? result.displayGreetingIntro && result.displayGreetingBody
              ? { intro: result.displayGreetingIntro, body: result.displayGreetingBody }
              : lastCoach
                ? { intro: '', body: lastCoach.content }
                : null
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

  const isDone = state.step === 'done';
  const stepIndex = state.step === 'done' ? STEPS.length : STEPS.indexOf(state.step);

  const opt = (value: LabelledOption, selected: boolean, onClick: () => void) => (
    <OptionTile key={value} label={t(OPTION_MESSAGE_KEY[value])} selected={selected} onClick={onClick} />
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Race-bib header */}
      <header className="shrink-0 border-b border-border bg-panel">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="border border-signal px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-signal">
              {t('coachLabel')}
            </span>
            {!isDone && (
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t(STEP_LABEL_KEY[state.step as OnboardingStepId])}
              </span>
            )}
          </div>
          {!isDone && (
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
              {t('stepOf', { step: stepIndex + 1, total: STEPS.length })}
            </span>
          )}
        </div>
        {!isDone && (
          <div className="mx-auto flex w-full max-w-2xl gap-1 px-6 pb-4">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={[
                  'h-[3px] flex-1 transition-colors',
                  i < stepIndex ? 'bg-signal/50' : i === stepIndex ? 'bg-signal' : 'bg-border',
                ].join(' ')}
              />
            ))}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-10">
          {error && (
            <div className="mb-6 flex items-start gap-3 border border-destructive/40 bg-destructive/5 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p role="alert" className="font-body text-sm text-foreground">
                {t('error')}
              </p>
            </div>
          )}

          {isDone ? (
            <Handoff
              raceTarget={state.answers.raceTarget}
              greeting={state.greeting}
              t={t}
            />
          ) : state.step === 'language' ? (
            <div className="space-y-4">
              <StepHeading title={t('qLanguage')} />
              <div className="grid gap-2 sm:grid-cols-2">
                <OptionTile label="English" selected={false} onClick={() => chooseLanguage('en')} />
                <OptionTile label="Dansk" selected={false} onClick={() => chooseLanguage('da')} />
              </div>
            </div>
          ) : state.step === 'experience' ? (
            <div className="space-y-4">
              <StepHeading title={t('qExperience')} help={t('qExperienceSub')} />
              <div className="grid gap-2">
                {(
                  [
                    ['beginner', 'expBeginner'],
                    ['intermediate', 'expIntermediate'],
                    ['veteran', 'expVeteran'],
                  ] as const
                ).map(([value, key]) => (
                  <OptionTile
                    key={value}
                    label={t(key)}
                    selected={false}
                    onClick={() => submit({ step: 'experience', experienceLevel: value })}
                  />
                ))}
              </div>
            </div>
          ) : state.step === 'race' ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (race.trim()) submit({ step: 'race', raceTarget: race.trim() });
              }}
            >
              <StepHeading title={t('qRace')} help={t('qRaceSub')} />
              <label htmlFor="onboarding-race" className="sr-only">
                {t('qRace')}
              </label>
              <input
                id="onboarding-race"
                value={race}
                onChange={(e) => setRace(e.target.value)}
                placeholder={t('racePlaceholder')}
                disabled={pending}
                className="w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-signal"
              />
              <PrimaryButton type="submit" disabled={pending || !race.trim()} pending={pending}>
                {t('continue')}
              </PrimaryButton>
            </form>
          ) : state.step === 'adaptive' ? (
            <div className="space-y-8">
              <StepHeading title={t('qAdaptive')} />

              {/*
                Outside every branch on purpose: how much time the athlete has
                is a ceiling the plan has to respect at any experience level,
                and it was previously asked of beginners only — leaving the
                Coach with no volume budget for the athletes most likely to
                have a demanding one.
              */}
              <FieldGroup label={t('availableHours')} note={t('optional')}>
                {ONBOARDING_OPTIONS.availableHours.map((o) =>
                  opt(o, availableHours === o, () =>
                    setAvailableHours(availableHours === o ? '' : o),
                  ),
                )}
              </FieldGroup>

              {state.answers.experienceLevel === 'beginner' && (
                <>
                  <FieldGroup label={t('sportBg')} note={t('optionalMulti')}>
                    {ONBOARDING_OPTIONS.sportBackground.map((o) =>
                      opt(o, sportBackground.includes(o), () =>
                        setSportBackground((a) => toggleMulti(a, o, 'None')),
                      ),
                    )}
                  </FieldGroup>
                  <FieldGroup label={t('motivation')} note={t('optional')}>
                    {ONBOARDING_OPTIONS.motivation.map((o) =>
                      opt(o, motivation === o, () => setMotivation(motivation === o ? '' : o)),
                    )}
                  </FieldGroup>
                </>
              )}

              {state.answers.experienceLevel === 'intermediate' && (
                <>
                  <div className="space-y-3">
                    <StepHeading
                      title={t('bestTime')}
                      help={t('optional')}
                    />
                    {/* StepHeading renders a heading, not a label, so it gives
                        the input no accessible name. Same sr-only pairing the
                        race step above already uses. */}
                    <label htmlFor="onboarding-best-time" className="sr-only">
                      {t('bestTime')}
                    </label>
                    <input
                      id="onboarding-best-time"
                      value={bestTime}
                      onChange={(e) => setBestTime(e.target.value)}
                      placeholder={t('bestTimePlaceholder')}
                      disabled={pending}
                      className="w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-signal"
                    />
                  </div>
                  <FieldGroup label={t('weakest')} note={t('optionalMulti')}>
                    {ONBOARDING_OPTIONS.weakestDiscipline.map((o) =>
                      opt(o, weakestDiscipline.includes(o), () =>
                        setWeakestDiscipline((a) => toggleMulti(a, o, null)),
                      ),
                    )}
                  </FieldGroup>
                  <FieldGroup label={t('humanCoach')}>
                    {ONBOARDING_OPTIONS.hasHumanCoach.map((o) =>
                      opt(o, hasHumanCoach === o, () => setHasHumanCoach(hasHumanCoach === o ? '' : o)),
                    )}
                  </FieldGroup>
                </>
              )}

              {state.answers.experienceLevel === 'veteran' && (
                <>
                  <div className="space-y-3">
                    <StepHeading title={t('targetTime')} help={t('optional')} />
                    <label htmlFor="onboarding-target-time" className="sr-only">
                      {t('targetTime')}
                    </label>
                    <input
                      id="onboarding-target-time"
                      value={targetTime}
                      onChange={(e) => setTargetTime(e.target.value)}
                      placeholder={t('targetTimePlaceholder')}
                      disabled={pending}
                      className="w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-signal"
                    />
                  </div>
                  <FieldGroup label={t('metrics')} note={t('optionalMulti')}>
                    {ONBOARDING_OPTIONS.trackedMetrics.map((o) =>
                      opt(o, trackedMetrics.includes(o), () =>
                        setTrackedMetrics((a) => toggleMulti(a, o, 'None')),
                      ),
                    )}
                  </FieldGroup>
                </>
              )}

              <PrimaryButton
                onClick={() =>
                  submit({
                    step: 'adaptive',
                    sportBackground: sportBackground.length > 0 ? sportBackground : undefined,
                    availableHours: availableHours || undefined,
                    motivation: motivation || undefined,
                    bestTime: bestTime || undefined,
                    weakestDiscipline: weakestDiscipline.length > 0 ? weakestDiscipline : undefined,
                    hasHumanCoach: hasHumanCoach || undefined,
                    targetTime: targetTime || undefined,
                    trackedMetrics: trackedMetrics.length > 0 ? trackedMetrics : undefined,
                  })
                }
                disabled={pending}
                pending={pending}
              >
                {t('continue')}
              </PrimaryButton>
            </div>
          ) : state.step === 'constraints' ? (
            <div className="space-y-8">
              <FieldGroup
                heading
                label={t('qConstraints')}
                note={t('qConstraintsSub')}
              >
                {DAYS.map((d) => (
                  <OptionTile
                    key={d}
                    label={t(OPTION_MESSAGE_KEY[d])}
                    selected={fixedConstraints.includes(d)}
                    onClick={() => setFixedConstraints((a) => toggleMulti(a, d, null))}
                  />
                ))}
              </FieldGroup>
              <FieldGroup heading label={t('weeklyDay')} note={t('weeklyDaySub')}>
                {ONBOARDING_OPTIONS.weeklySessionDay.map((o) => (
                  <OptionTile
                    key={o}
                    label={t(OPTION_MESSAGE_KEY[o])}
                    selected={weeklySessionDay === o}
                    onClick={() => setWeeklySessionDay(weeklySessionDay === o ? '' : o)}
                  />
                ))}
              </FieldGroup>
              <PrimaryButton
                onClick={() =>
                  submit({
                    step: 'constraints',
                    fixedConstraints,
                    weeklySessionDay: weeklySessionDay || undefined,
                  })
                }
                disabled={pending}
                pending={pending}
              >
                {t('finish')}
              </PrimaryButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StepHeading({ title, help }: { title: string; help?: string }) {
  return (
    <div>
      <h2 className="font-display text-3xl tracking-[0.03em] text-foreground">{title}</h2>
      {help && <p className="mt-2 font-body text-sm text-muted-foreground">{help}</p>}
    </div>
  );
}

function FieldGroup({
  label,
  note,
  heading,
  children,
}: {
  label: string;
  note?: string;
  /** Use the bigger StepHeading treatment (constraints step's two field groups
   *  stand alone rather than under one shared "About you" heading). */
  heading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {heading ? (
        <StepHeading title={label} help={note} />
      ) : (
        <p className="font-body text-sm text-foreground">
          {label}
          {note && <span className="ml-2 font-body text-xs text-muted-foreground">{note}</span>}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function OptionTile({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'flex items-center justify-between gap-3 border px-4 py-3 text-left transition-colors',
        selected
          ? 'border-signal bg-signal/5'
          : 'border-border bg-panel hover:border-muted-foreground',
      ].join(' ')}
    >
      <span className="font-body text-sm text-foreground">{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-signal" />}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  pending,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  pending?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 bg-signal px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {children}
      {!pending && <ArrowRight className="h-3 w-3" />}
    </button>
  );
}

function Handoff({
  raceTarget,
  greeting,
  t,
}: {
  raceTarget?: string;
  greeting: { intro: string; body: string } | null;
  t: ReturnType<typeof useTranslations<'Onboarding'>>;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal">
        {t('coachLabel')}
      </p>
      {greeting?.intro && (
        <h1 className="font-display text-5xl leading-[1.05] tracking-[0.02em] text-foreground">
          {greeting.intro}
        </h1>
      )}
      <div className="border-l-2 border-signal bg-panel px-6 py-6">
        <p className="whitespace-pre-wrap font-body text-lg leading-relaxed text-foreground">
          {greeting?.body}
        </p>
      </div>
      <dl className="grid gap-px border border-border bg-border sm:grid-cols-2">
        <div className="bg-panel px-4 py-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t('raceTargetLabel')}
          </dt>
          <dd className="mt-1 font-body text-sm text-foreground">{raceTarget}</dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t('nextLabel')}
          </dt>
          <dd className="mt-1 font-body text-sm text-foreground">{t('nextValue')}</dd>
        </div>
      </dl>
      <PrimaryButton onClick={() => router.refresh()}>{t('startTraining')}</PrimaryButton>
    </div>
  );
}
