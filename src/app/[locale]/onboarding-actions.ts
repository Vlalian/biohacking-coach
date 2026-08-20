'use server';

import { headers } from 'next/headers';
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
        payload.availableHours,
        payload.sportBackground?.join(', '),
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
  | (AnswerResult & { displayGreetingIntro?: string; displayGreetingBody?: string })
  | AuthFailure;

export async function answerOnboardingAction(
  payload: StepAnswer,
): Promise<OnboardingActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: 'not-authenticated' };
  const athlete = await getAthleteByUserId(session.user.id);
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  const t = await getTranslations('Onboarding');

  const raceForGreeting =
    payload.step === 'race'
      ? payload.raceTarget
      : (athlete.profile?.onboardingAnswers?.raceTarget ?? '');

  // Two greetings on purpose: the persisted one is name-free, because messages
  // is a training-side table keyed by athlete id and must never carry a name
  // (ADR 0006). The personalized one exists only in this response, for display
  // — first name only (Origin Story: "Hello {firstName}, I'm your AI Coach"),
  // computed here rather than trimmed client-side so it stays correct
  // regardless of locale.
  const firstName = session.user.name.trim().split(/\s+/)[0] ?? '';
  const stored = coachGreeting('', raceForGreeting);
  const personal = coachGreeting(firstName, raceForGreeting);

  const result = await answerOnboardingStep(
    athlete,
    payload,
    { question: t(STEP_QUESTION_KEY[payload.step]), answer: answerText(payload) },
    `${stored.intro} ${stored.body}`,
    new Date(),
  );

  if (!result.ok) return result;

  // The language choice lands on the user, identity-side (ticket 09) — but only
  // once onboarding has accepted the step. Writing it first would let a payload
  // the closed-set validation rejects still leave an invalid preference behind.
  if (payload.step === 'language') {
    await setUiLanguage(session.user.id, payload.language);
  }

  // Completion shows the climax hand-off screen; the athlete moves on by
  // clicking through it, which calls router.refresh(). No revalidatePath
  // here: root page.tsx is already `force-dynamic` (never cached), so
  // revalidating it would only invalidate the route this action itself runs
  // on — which makes Next.js replace this transition's result with the
  // already-onboarded redirect to /training-plan before the client ever
  // renders the hand-off screen, skipping the Coach's first message entirely.
  if (result.step === 'done') {
    return {
      ...result,
      displayGreetingIntro: personal.intro,
      displayGreetingBody: personal.body,
    };
  }
  return result;
}
