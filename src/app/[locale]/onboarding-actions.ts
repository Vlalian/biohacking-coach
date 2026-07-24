'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { setUiLanguage } from '@/features/user-prefs/user-prefs-repository';
import {
  answerOnboardingStep,
  type AnswerResult,
} from '@/features/onboarding/onboarding-service';
import { coachGreeting, type StepAnswer } from '@/features/onboarding/onboarding-flow';

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
 */

type AuthFailure = { ok: false; reason: 'not-authenticated' };

const STEP_QUESTION_KEY: Record<StepAnswer['step'], string> = {
  language: 'qLanguage',
  experience: 'qExperience',
  race: 'qRace',
  adaptive: 'qAdaptive',
  constraints: 'qConstraints',
};

/** The athlete's answer as one human-readable transcript line. */
function answerText(payload: StepAnswer): string {
  switch (payload.step) {
    case 'language':
      return payload.language === 'da' ? 'Dansk' : 'English';
    case 'experience':
      return payload.experienceLevel;
    case 'race':
      return payload.raceTarget;
    case 'adaptive': {
      const parts = [
        payload.sportBackground?.join(', '),
        payload.weeklyHours,
        payload.motivation,
        payload.bestTime,
        payload.weakestDiscipline?.join(', '),
        payload.hasHumanCoach,
        payload.targetTime,
        payload.trackedMetrics?.join(', '),
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : '—';
    }
    case 'constraints': {
      const days =
        payload.fixedConstraints && payload.fixedConstraints.length > 0
          ? payload.fixedConstraints.join(', ')
          : '—';
      return `${days} · ${payload.weeklySessionDay ?? 'Flexible'}`;
    }
  }
}

export type OnboardingActionResult =
  | (AnswerResult & { displayGreeting?: string })
  | AuthFailure;

export async function answerOnboardingAction(
  payload: StepAnswer,
): Promise<OnboardingActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: 'not-authenticated' };
  const athlete = await getAthleteByUserId(session.user.id);
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  const t = await getTranslations('Onboarding');

  // The language choice lands on the user, identity-side (ticket 09). Written
  // before the step is applied so even a mid-flow refresh keeps the choice.
  if (payload.step === 'language') {
    await setUiLanguage(session.user.id, payload.language);
  }

  const raceForGreeting =
    payload.step === 'race'
      ? payload.raceTarget
      : (athlete.profile?.onboardingAnswers?.raceTarget ?? '');

  // Two greetings on purpose: the persisted one is name-free, because messages
  // is a training-side table keyed by athlete id and must never carry a name
  // (ADR 0006). The personalized one exists only in this response, for display.
  const stored = coachGreeting('', raceForGreeting);
  const personal = coachGreeting(session.user.name, raceForGreeting);

  const result = await answerOnboardingStep(
    athlete,
    payload,
    { question: t(STEP_QUESTION_KEY[payload.step]), answer: answerText(payload) },
    `${stored.intro} ${stored.body}`,
    new Date(),
  );

  // Completion flips the page from onboarding to the calendar — refresh it.
  if (result.ok && result.step === 'done') {
    revalidatePath('/', 'layout');
    return { ...result, displayGreeting: `${personal.intro} ${personal.body}` };
  }
  return result;
}
