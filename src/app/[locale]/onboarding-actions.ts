'use server';

import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import type { Athlete } from '@/features/athlete/athlete';
import {
  getUiPrefs,
  setPreferredName,
  setUiLanguage,
} from '@/features/user-prefs/user-prefs-repository';
import { parsePreferredName } from '@/features/user-prefs/preferred-name';
import {
  answerOnboardingStep,
  type AnswerResult,
} from '@/features/onboarding/onboarding-service';
import { coachGreeting, type StepAnswer } from '@/features/onboarding/onboarding-flow';
import { answerText } from '@/features/onboarding/onboarding-transcript';
import { today } from '@/lib/date';

/**
 * Server action for MCQ onboarding.
 *
 * The athlete is resolved from the authenticated session; the client sends only
 * the answered step. Validation happens in the pure flow module against closed
 * option sets — an invalid payload stores nothing.
 *
 * Choosing a language does two things at once: it persists to the user's
 * `ui_prefs` here, and the client switches the next-intl locale — so the UI and
 * the Coach change language immediately, and nothing touches the profile
 * answers (the "without resetting the profile" criterion).
 *
 * The Preferred Name step (`preferred-name/02`) lands the same way: the flow
 * validates it and records only that the step was answered; the name itself is
 * stored here, on the user, and never reaches the profile JSONB or the
 * transcript — both are training-side (ADR 0006).
 */

type AuthFailure = { ok: false; reason: 'not-authenticated' };

const STEP_QUESTION_KEY: Record<StepAnswer['step'], string> = {
  language: 'qLanguage',
  name: 'qName',
  pastRaces: 'qPastRaces',
  distance: 'qDistance',
  hours: 'qHours',
  race: 'qRace',
  adaptive: 'qAdaptive',
  constraints: 'qConstraints',
};

export type OnboardingActionResult =
  | (AnswerResult & { displayGreetingIntro?: string; displayGreetingBody?: string })
  | AuthFailure;

/**
 * The two answers that land on the *user* rather than in the profile answers —
 * both identity-side, both written only once onboarding has accepted the step.
 * Writing first would let a payload the validation rejects still leave a value
 * behind.
 *
 * The language: ticket 09. The Preferred Name (`preferred-name/02`): parsed
 * again here rather than handed back by the flow, so the flow never returns a
 * name and the value stored is exactly the validated one. Blank clears it —
 * skipping the step is "no name", not "keep whatever was there".
 */
async function storeUserSidePreference(userId: string, payload: StepAnswer): Promise<void> {
  if (payload.step === 'language') {
    await setUiLanguage(userId, payload.language);
  } else if (payload.step === 'name') {
    const parsed = parsePreferredName(payload.preferredName);
    await setPreferredName(userId, parsed.ok ? parsed.name : null);
  }
}

/** The race the greeting names: this step's answer if it is the race step, else the stored one. */
function raceForGreeting(payload: StepAnswer, athlete: Athlete): string {
  if (payload.step === 'race') return 'noRaceYet' in payload ? '' : payload.raceTarget;
  return athlete.profile?.onboardingAnswers?.raceTarget ?? '';
}

/**
 * The hand-off screen's greeting, by the Preferred Name the athlete chose —
 * read from the user seam — and by nothing else. This used to derive a first
 * name from `user.name` (`trim().split(/\s+/)[0]`), which guessed wrong for
 * anyone whose family name is written first; `preferred-name/02` removed the
 * derivation entirely. No name chosen means no name in the greeting. Display
 * only: what is persisted is the name-free line (ADR 0006).
 */
async function withDisplayGreeting(
  result: AnswerResult & { ok: true },
  userId: string,
  race: string,
): Promise<OnboardingActionResult> {
  const { preferredName } = await getUiPrefs(userId);
  const personal = coachGreeting(preferredName, race);
  return { ...result, displayGreetingIntro: personal.intro, displayGreetingBody: personal.body };
}

export async function answerOnboardingAction(
  payload: StepAnswer,
): Promise<OnboardingActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: 'not-authenticated' };
  const athlete = await getAthleteByUserId(session.user.id);
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  const t = await getTranslations('Onboarding');
  const race = raceForGreeting(payload, athlete);

  // The persisted greeting is name-free, because messages is a training-side
  // table keyed by athlete id and must never carry a name (ADR 0006). The
  // personalized one is built at completion, below, from the Preferred Name.
  const stored = coachGreeting('', race);

  const result = await answerOnboardingStep(
    athlete,
    payload,
    { question: t(STEP_QUESTION_KEY[payload.step]), answer: answerText(payload) },
    `${stored.intro} ${stored.body}`,
    today(),
  );

  if (!result.ok) return result;

  await storeUserSidePreference(session.user.id, payload);

  // Completion shows the climax hand-off screen; the athlete moves on by
  // clicking through it, which calls router.refresh(). No revalidatePath
  // here: root page.tsx is already `force-dynamic` (never cached), so
  // revalidating it would only invalidate the route this action itself runs
  // on — which makes Next.js replace this transition's result with the
  // already-onboarded redirect to /training-plan before the client ever
  // renders the hand-off screen, skipping the Coach's first message entirely.
  return result.step === 'done' ? withDisplayGreeting(result, session.user.id, race) : result;
}
