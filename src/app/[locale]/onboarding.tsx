'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';
import {
  ADAPTIVE_FIELDS_BY_LEVEL,
  ONBOARDING_OPTIONS,
  OPTION_MESSAGE_KEY,
  type LabelledOption,
  type OnboardingAnswers,
  type OnboardingStepId,
  type StepAnswer,
  cursorAfter,
  HOURS_PER_WEEK_MAX,
  HOURS_PER_WEEK_MIN,
  previousStep,
} from '@/features/onboarding/onboarding-flow';
import { formatFinish, parseFinishInput, type PastRace } from '@/features/onboarding/past-races';
import { PreferredNameField } from '@/components/preferred-name-field';
import { answerOnboardingAction } from './onboarding-actions';

/**
 * MCQ onboarding, Coach-voice-only (ADR 0001): every question is the Coach
 * talking — no wizard chrome beyond a step counter, no mascots, no tooltips.
 *
 * The flow is the POC's question set plus one: language → name → experience →
 * distance → race → adaptive (per level) → constraints. Answers persist
 * server-side step by step, so a refresh resumes at the first unanswered step
 * (`initial` carries that state). Choosing Dansk switches the next-intl locale
 * immediately — the UI re-renders in Danish and the Coach's language preference
 * is stored with the user — and touches nothing else.
 *
 * The name step (`preferred-name/02`) asks what the Coach should call the
 * athlete: an **empty** field, nothing prefilled, skippable to nothing. It is
 * not the Lovable brief's identity step — the account name already lives on
 * the auth user (ADR 0006) and is never read for this. `accountName` reaches
 * this component for one purpose only: to warn when what the athlete types is
 * their real name, so a real name arrives only after they read a sentence
 * saying so (see `PreferredNameField`).
 *
 * Visual language ported from the Lovable design (iron-insight-grid,
 * onboarding-session brief): race-bib header with a step progress rail,
 * bordered option tiles, and the climax hand-off screen. The Lovable brief
 * assumed an identity step and a history-upload step that don't exist in this
 * flow — the athlete's name already lives on the auth user (ADR 0006) and
 * upload is its own feature reachable from the Training Plan — so this port
 * carries the *look*, not those steps.
 *
 * Back (showable-version/32): every step after the first has one. It returns
 * to the previous step with its saved answer shown; nothing is unsubmitted.
 * After a new answer the athlete walks forward again through every later
 * step, each pre-filled — the server reports the first *unanswered* step,
 * which after Back is where they already were, so the client owns the cursor
 * (`cursorAfter`) and each step panel seeds its drafts from the saved answers
 * when it mounts.
 */

export interface OnboardingInitial {
  step: OnboardingStepId;
  answers: OnboardingAnswers;
  /** `user.name`, for the real-name warning on the name step only. */
  accountName: string;
}

type UiState = {
  step: OnboardingStepId | 'done';
  answers: OnboardingAnswers;
  /** Populated only on completion; two parts so the climax screen can give the
   *  headline and the message their own visual weight (see Handoff below). */
  greeting: { intro: string; body: string } | null;
};

const STEPS: OnboardingStepId[] = [
  'language',
  'name',
  'pastRaces',
  'distance',
  'hours',
  'race',
  'adaptive',
  'constraints',
];

const STEP_LABEL_KEY: Record<OnboardingStepId, string> = {
  language: 'stepLanguage',
  name: 'stepName',
  pastRaces: 'stepPastRaces',
  distance: 'stepDistance',
  hours: 'stepHours',
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
        step: cursorAfter(payload.step, result.step),
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
  // Back (showable-version/32): the previous step, with its saved answer.
  // Nothing is unsubmitted — the answer stays until the athlete gives a new
  // one, and the walk forward from there revisits every later step.
  const back = isDone ? null : previousStep(state.step as OnboardingStepId);

  function goBack() {
    if (!back) return;
    setError(false);
    setState((s) => ({ ...s, step: back }));
  }

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

          {back && (
            <button
              type="button"
              data-action="back"
              onClick={goBack}
              disabled={pending}
              className="mb-6 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('back')}
            </button>
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
                <OptionTile label="English" selected={state.answers.language === 'en'} onClick={() => chooseLanguage('en')} />
                <OptionTile label="Dansk" selected={state.answers.language === 'da'} onClick={() => chooseLanguage('da')} />
              </div>
            </div>
          ) : state.step === 'name' ? (
            <div className="space-y-4">
              <StepHeading title={t('qName')} help={t('qNameSub')} />
              {/*
                Empty by default and never derived from the account name (Mads,
                2026-08-21): a prefilled first name accepted in one tap would be
                the app sending a real name in the common case, with the default
                deciding rather than the athlete. Blank is an answer — the Coach
                stays nameless — and Continue with an empty field means the same
                as Skip, so neither path can get stuck.
              */}
              <PreferredNameField
                accountName={initial.accountName}
                disabled={pending}
                onCommit={(value) =>
                  submit({ step: 'name', preferredName: value.trim() || undefined })
                }
                actions={(commit, draft) => (
                  <div className="flex flex-wrap items-center gap-4">
                    <PrimaryButton onClick={() => commit(draft)} disabled={pending} pending={pending}>
                      {t('continue')}
                    </PrimaryButton>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => submit({ step: 'name' })}
                      className="font-body text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      {t('skipName')}
                    </button>
                  </div>
                )}
              />
            </div>
          ) : state.step === 'pastRaces' ? (
            <PastRacesPanel answers={state.answers} pending={pending} t={t} submit={submit} />
          ) : state.step === 'distance' ? (
            <div className="space-y-4">
              {/*
                Asked of every athlete, before the race and independently of it:
                an athlete building toward an Ironman with nothing booked still
                needs an Ironman-shaped week (*Distancens Arkitektur* §14). A
                closed set because the per-distance rules are bands, and a band
                cannot be looked up from prose.
              */}
              <StepHeading title={t('qDistance')} help={t('qDistanceSub')} />
              <div className="grid gap-2 sm:grid-cols-2">
                {ONBOARDING_OPTIONS.raceDistance.map((value) => (
                  <OptionTile
                    key={value}
                    label={t(OPTION_MESSAGE_KEY[value])}
                    selected={state.answers.raceDistance === value}
                    onClick={() => submit({ step: 'distance', raceDistance: value })}
                  />
                ))}
              </div>
            </div>
          ) : state.step === 'hours' ? (
            <HoursPanel answers={state.answers} pending={pending} t={t} submit={submit} />
          ) : state.step === 'race' ? (
            <RacePanel answers={state.answers} pending={pending} t={t} submit={submit} />
          ) : state.step === 'adaptive' ? (
            <AdaptivePanel answers={state.answers} pending={pending} t={t} submit={submit} />
          ) : state.step === 'constraints' ? (
            <ConstraintsPanel answers={state.answers} pending={pending} t={t} submit={submit} />
          ) : null}
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */

type PanelProps = {
  answers: OnboardingAnswers;
  pending: boolean;
  t: ReturnType<typeof useTranslations<'Onboarding'>>;
  submit: (payload: StepAnswer) => void;
};

/*
 * One panel per free-form step, each holding its own drafts and seeding them
 * from the saved answers on mount — so a step re-entered through Back, or
 * walked forward into again, shows what the athlete said last time. The
 * panels are distinct components, so a step change remounts and re-seeds.
 */

function RacePanel({ answers, pending, t, submit }: PanelProps) {
  const [race, setRace] = useState(answers.raceTarget ?? '');
  const [raceDate, setRaceDate] = useState(answers.raceDate ?? '');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (race.trim() && raceDate)
          submit({ step: 'race', raceTarget: race.trim(), raceDate });
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
      <label htmlFor="onboarding-race-date" className="sr-only">
        {t('qRaceDate')}
      </label>
      <input
        id="onboarding-race-date"
        type="date"
        value={raceDate}
        onChange={(e) => setRaceDate(e.target.value)}
        disabled={pending}
        className="w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors focus:border-signal"
      />
      <PrimaryButton
        type="submit"
        disabled={pending || !race.trim() || !raceDate}
        pending={pending}
      >
        {t('continue')}
      </PrimaryButton>
      {/*
        The way out, and it has to be a real one. This step used to
        require a non-empty race name, so an athlete with nothing booked
        could not pass it without inventing a race — and "ready to start
        the next block" is as valid a goal as a start line. Saying so is
        stored as a decision, not as an unanswered question.
      */}
      <button
        type="button"
        disabled={pending}
        onClick={() => submit({ step: 'race', noRaceYet: true })}
        className="font-body text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
      >
        {t('noRaceYet')}
      </button>
    </form>
  );
}

function AdaptivePanel({ answers, pending, t, submit }: PanelProps) {
  const [sportBackground, setSportBackground] = useState<string[]>(answers.sportBackground ?? []);
  const [motivation, setMotivation] = useState(answers.motivation ?? '');
  const [bestTime, setBestTime] = useState(answers.bestTime ?? '');
  const [weakestDiscipline, setWeakestDiscipline] = useState<string[]>(answers.weakestDiscipline ?? []);
  const [hasHumanCoach, setHasHumanCoach] = useState(answers.hasHumanCoach ?? '');
  const [targetTime, setTargetTime] = useState(answers.targetTime ?? '');
  const [trackedMetrics, setTrackedMetrics] = useState<string[]>(answers.trackedMetrics ?? []);

  const opt = (value: LabelledOption, selected: boolean, onClick: () => void) => (
    <OptionTile key={value} label={t(OPTION_MESSAGE_KEY[value])} selected={selected} onClick={onClick} />
  );

  return (
    <div className="space-y-8">
      <StepHeading title={t('qAdaptive')} />

      {answers.experienceLevel === 'beginner' && (
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

      {answers.experienceLevel === 'intermediate' && (
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

      {answers.experienceLevel === 'veteran' && (
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
        onClick={() => {
          // Only the fields this level asked: the drafts are seeded from every
          // saved answer, and an answer from another level must not ride along.
          const all = {
            sportBackground: sportBackground.length > 0 ? sportBackground : undefined,
            motivation: motivation || undefined,
            bestTime: bestTime || undefined,
            weakestDiscipline: weakestDiscipline.length > 0 ? weakestDiscipline : undefined,
            hasHumanCoach: hasHumanCoach || undefined,
            targetTime: targetTime || undefined,
            trackedMetrics: trackedMetrics.length > 0 ? trackedMetrics : undefined,
          };
          const asked = ADAPTIVE_FIELDS_BY_LEVEL[answers.experienceLevel ?? 'beginner'];
          submit({ step: 'adaptive', ...Object.fromEntries(asked.map((f) => [f, all[f]])) });
        }}
        disabled={pending}
        pending={pending}
      >
        {t('continue')}
      </PrimaryButton>
    </div>
  );
}

/**
 * "How many hours a week can you realistically train?" — asked, never
 * suggested: no default, no placeholder number (Mads, 2026-09-19: "A and only
 * A"). An integer 1–30; the flow refuses anything else.
 */
function HoursPanel({ answers, pending, t, submit }: PanelProps) {
  const [hours, setHours] = useState(answers.hoursPerWeek === undefined ? '' : String(answers.hoursPerWeek));
  const value = Number(hours);
  const valid = hours !== '' && Number.isInteger(value) && value >= HOURS_PER_WEEK_MIN && value <= HOURS_PER_WEEK_MAX;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) submit({ step: 'hours', hoursPerWeek: value });
      }}
    >
      <StepHeading title={t('qHours')} help={t('qHoursSub')} />
      <label htmlFor="onboarding-hours" className="sr-only">
        {t('qHours')}
      </label>
      <input
        id="onboarding-hours"
        type="number"
        inputMode="numeric"
        min={HOURS_PER_WEEK_MIN}
        max={HOURS_PER_WEEK_MAX}
        step={1}
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        disabled={pending}
        className="w-32 border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors focus:border-signal"
      />
      <PrimaryButton type="submit" data-action="submit-hours" disabled={pending || !valid} pending={pending}>
        {t('continue')}
      </PrimaryButton>
    </form>
  );
}

/**
 * The races the athlete has finished, one row each — distance, date, finish
 * time (optional), a note (optional). "I haven't raced yet" submits an empty
 * list, which is an answer. The experience level is derived server-side from
 * the count; nothing here asks for it.
 */
function PastRacesPanel({ answers, pending, t, submit }: PanelProps) {
  const [races, setRaces] = useState<PastRace[]>(answers.pastRaces ?? []);
  const [distance, setDistance] = useState<string>('');
  const [date, setDate] = useState('');
  const [finish, setFinish] = useState('');
  const [note, setNote] = useState('');
  const finishSeconds = parseFinishInput(finish);
  const canAdd = distance !== '' && date !== '' && finishSeconds !== undefined && note.length <= 200;

  function add() {
    if (!canAdd) return;
    setRaces((r) => [
      ...r,
      {
        distance: distance as PastRace['distance'],
        date,
        finishSeconds: finishSeconds ?? null,
        note: note.trim() === '' ? null : note.trim(),
      },
    ]);
    setDistance('');
    setDate('');
    setFinish('');
    setNote('');
  }

  return (
    <div className="space-y-6">
      <StepHeading title={t('qPastRaces')} help={t('qPastRacesSub')} />

      {races.length > 0 && (
        <ul className="divide-y divide-border border border-border">
          {races.map((r, i) => (
            <li key={`${r.date}-${i}`} data-past-race={i} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="font-body text-sm text-foreground">
                {t(OPTION_MESSAGE_KEY[r.distance])} · {r.date}
                {r.finishSeconds !== null && ` · ${formatFinish(r.finishSeconds)}`}
                {r.note && <span className="ml-2 text-muted-foreground">{r.note}</span>}
              </span>
              <button
                type="button"
                data-action="remove-past-race"
                aria-label={t('removePastRace')}
                disabled={pending}
                onClick={() => setRaces((list) => list.filter((_, k) => k !== i))}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 border border-dashed border-border p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {ONBOARDING_OPTIONS.raceDistance.map((d) => (
            <OptionTile key={d} label={t(OPTION_MESSAGE_KEY[d])} selected={distance === d} onClick={() => setDistance(d)} />
          ))}
        </div>
        <label htmlFor="onboarding-past-race-date" className="sr-only">
          {t('pastRaceDate')}
        </label>
        <input
          id="onboarding-past-race-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={pending}
          className="w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors focus:border-signal"
        />
        <label htmlFor="onboarding-past-race-finish" className="sr-only">
          {t('pastRaceFinish')}
        </label>
        <input
          id="onboarding-past-race-finish"
          value={finish}
          onChange={(e) => setFinish(e.target.value)}
          placeholder={t('pastRaceFinish')}
          disabled={pending}
          className="w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-signal"
        />
        <label htmlFor="onboarding-past-race-note" className="sr-only">
          {t('pastRaceNote')}
        </label>
        <input
          id="onboarding-past-race-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('pastRaceNote')}
          maxLength={200}
          disabled={pending}
          className="w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-signal"
        />
        <button
          type="button"
          data-action="add-past-race"
          onClick={add}
          disabled={pending || !canAdd}
          className="border border-border px-3 py-1.5 font-body text-sm text-foreground transition-colors hover:border-signal disabled:opacity-50"
        >
          {t('addPastRace')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <PrimaryButton
          data-action="submit-past-races"
          onClick={() => submit({ step: 'pastRaces', pastRaces: races })}
          disabled={pending || races.length === 0}
          pending={pending}
        >
          {t('continue')}
        </PrimaryButton>
        <button
          type="button"
          data-action="no-past-races"
          disabled={pending}
          onClick={() => submit({ step: 'pastRaces', pastRaces: [] })}
          className="font-body text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
        >
          {t('noPastRaces')}
        </button>
      </div>
    </div>
  );
}

function ConstraintsPanel({ answers, pending, t, submit }: PanelProps) {
  const [fixedConstraints, setFixedConstraints] = useState<string[]>(answers.fixedConstraints ?? []);
  const [weeklySessionDay, setWeeklySessionDay] = useState(answers.weeklySessionDay ?? '');
  return (
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
  'data-action': dataAction,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  pending?: boolean;
  type?: 'button' | 'submit';
  'data-action'?: string;
}) {
  return (
    <button
      type={type}
      data-action={dataAction}
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
