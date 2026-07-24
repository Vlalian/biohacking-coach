import type { Athlete } from '@/features/athlete/athlete';
import {
  completeAthleteOnboarding,
  mergeAthleteProfile,
} from '@/features/athlete/athlete-repository';
import {
  appendMessages,
  createConversation,
  endConversation,
  getLatestOpenConversation,
  getMessages,
} from '@/features/coach/conversation-repository';
import type { Message } from '@/features/coach/conversation';
import {
  applyAnswer,
  completeProfile,
  nextStep,
  toCoachOnboarding,
  type OnboardingAnswers,
  type OnboardingStepId,
  type StepAnswer,
} from './onboarding-flow';

/**
 * The MCQ onboarding's server-side orchestration — wires the pure flow to the
 * athlete repository and the conversation log.
 *
 * Onboarding is a conversation, so it persists like every other one:
 * `conversations.kind = 'onboarding'` (ticket 05, ballot 4). Each answered step
 * appends the Coach's question and the athlete's answer to the transcript; the
 * machine-readable answers live in the profile JSONB, which is also the resume
 * point — an interrupted flow picks up at the first unanswered step.
 *
 * No Claude call happens here: the POC's onboarding is a scripted question set
 * in the Coach's voice (ADR 0001), not a generated conversation.
 */

export interface OnboardingState {
  step: OnboardingStepId | 'done';
  answers: OnboardingAnswers;
  messages: Message[];
}

/** The athlete's onboarding position: current step, answers so far, transcript. */
export async function getOnboardingState(
  athlete: Athlete,
): Promise<OnboardingState> {
  const answers = athlete.profile?.onboardingAnswers ?? {};
  const submitted = athlete.profile?.onboardingSubmitted ?? {};
  const open = await getLatestOpenConversation(athlete.id, 'onboarding');
  const messages = open ? await getMessages(open.id) : [];
  return { step: nextStep(answers, submitted), answers, messages };
}

export type AnswerResult =
  | {
      ok: true;
      step: OnboardingStepId | 'done';
      answers: OnboardingAnswers;
      messages: Message[];
    }
  | { ok: false; reason: 'invalid' };

/**
 * Applies one answered step: validates against the closed option sets, merges
 * the answers into the profile JSONB, and appends the exchange to the persisted
 * onboarding conversation. When the last step lands, the profile columns are
 * written, the Coach's greeting closes the transcript, and the conversation is
 * marked ended.
 *
 * `transcript` carries the texts to persist: the question localized as the
 * Coach asked it, and the answer as canonical option values (not the localized
 * labels) — stable, parseable, and identical whichever language the athlete
 * answered in. `greeting` is appended only on completion and must be name-free:
 * `messages` is a training-side table (ADR 0006). `today` anchors the phase
 * computation.
 */
export async function answerOnboardingStep(
  athlete: Athlete,
  payload: StepAnswer,
  transcript: { question: string; answer: string },
  greeting: string,
  today: Date,
): Promise<AnswerResult> {
  const currentAnswers = athlete.profile?.onboardingAnswers ?? {};
  const currentSubmitted = athlete.profile?.onboardingSubmitted ?? {};

  const applied = applyAnswer(currentAnswers, currentSubmitted, payload);
  if (!applied) return { ok: false, reason: 'invalid' };

  // One open onboarding conversation per athlete: reuse it or start it.
  const conversation =
    (await getLatestOpenConversation(athlete.id, 'onboarding')) ??
    (await createConversation({ athleteId: athlete.id, kind: 'onboarding' }));

  await appendMessages(athlete.id, conversation.id, [
    { role: 'coach_ai', content: transcript.question },
    { role: 'athlete', content: transcript.answer },
  ]);

  const step = nextStep(applied.answers, applied.submitted);

  if (step === 'done') {
    const completed = completeProfile(applied.answers, today);
    // nextStep === 'done' guarantees the required answers exist; this guard is
    // for the type system, not a reachable branch.
    if (!completed) return { ok: false, reason: 'invalid' };

    await mergeAthleteProfile(athlete.id, {
      onboardingAnswers: applied.answers,
      onboardingSubmitted: applied.submitted,
      // The shapes the Coach prompts read from now on.
      onboarding: toCoachOnboarding(applied.answers),
      fixedConstraints: applied.answers.fixedConstraints ?? [],
      weeklySessionDay: applied.answers.weeklySessionDay,
    });
    await completeAthleteOnboarding(athlete.id, completed);
    await appendMessages(athlete.id, conversation.id, [
      { role: 'coach_ai', content: greeting },
    ]);
    await endConversation(athlete.id, conversation.id, new Date());
  } else {
    await mergeAthleteProfile(athlete.id, {
      onboardingAnswers: applied.answers,
      onboardingSubmitted: applied.submitted,
    });
  }

  return {
    ok: true,
    step,
    answers: applied.answers,
    messages: await getMessages(conversation.id),
  };
}
