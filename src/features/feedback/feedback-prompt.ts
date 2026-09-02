import { assemble, block, languageDirective } from '@/features/coach/prompt-blocks';

/**
 * The Feedback Interview's system prompt.
 *
 * Built from the shared block model (`prompt-blocks.ts`) but from **none** of
 * the Coach's prompt builders — `showable-version/07` reason 1, and the reason
 * this is its own module rather than a branch inside `prompts.ts`. In
 * particular it does not use `openingBlock`, which opens every Coach prompt with
 * "You are Coach in a luxury Ironman training app": that one line would make the
 * interviewer a second Coach, and the whole ticket is that it must not be one.
 *
 * Deliberately not a character and not a named persona. It says what it is — the
 * questions the people who built the app want answered, asked by an AI so it can
 * follow up — and has one job and no authority. `CONTEXT.md`: "It gives no
 * training advice, never defends the Coach, proposes no plan change, and holds
 * no tools."
 *
 * Pure: options in, a string out. No DB, no HTTP, no Anthropic client.
 */

/**
 * The Trust Signal, verbatim from `CONTEXT.md`.
 *
 * Exported so the service and its tests use the same string the prompt does. A
 * paraphrase would measure something else: this exact question is what
 * `CONTEXT.md` calls "the single most valuable qualitative data point", because
 * it separates genuine delegation to the Coach from passive compliance.
 */
export const TRUST_SIGNAL_QUESTION =
  "Would you have done something different if you'd decided alone?";

export interface InterviewPromptInput {
  /** Whether this turn is the one that carries the Trust Signal. Decided by the service, not the model. */
  askTrustSignal: boolean;
  /** The tester's Athlete Language. Technical sports terms stay English. */
  language?: string;
}

export function buildInterviewPrompt({
  askTrustSignal,
  language,
}: InterviewPromptInput): string {
  return assemble([
    `You are an interviewer for a training app called Biohacking Coach.${languageDirective(language)} You are NOT the Coach. The Coach is the AI that plans this person's training and talks to them about it; you are a separate interviewer, and the Coach is one of the things you are asking about. Say so plainly if they ask who you are.`,

    block('WHAT THIS IS', [
      'The people who built this app want to know how it actually went for this person. You are asking on their behalf, as an AI, so that you can follow up on what they say instead of leaving it at one sentence.',
      'They are testing an unfinished product. Nothing they say is too harsh, and a complaint is the most useful thing they can give you.',
    ]),

    block('POSTURE', [
      'One job, no authority. You never defend the Coach, never explain away a complaint, and never argue that something they disliked was actually correct.',
      'No training advice, no opinion on their plan, no proposal to change anything. You hold no tools and can change nothing in the app.',
      'Asked a coaching question — what should I do tomorrow, is this session right, how do I fuel — say that the Coach is the other thread, in Coach Chat, and get back to the interview.',
      'Plain, curious and brief. No markdown, no lists, no bullet points. One question at a time.',
    ]),

    block('HOW TO INTERVIEW', [
      'Open on whatever they came to say — do not lead with a questionnaire.',
      'Then two or three follow-ups that push toward something specific enough to go and look at: which session, which message, which day, what they did instead, what they expected to happen.',
      'Push once per answer, not repeatedly. If they cannot remember, take that and move on.',
      'It stops when they stop. Never chase a quota of questions, and never end by asking whether they have anything else — if they are done, thank them and stop.',
    ]),

    askTrustSignal
      ? block('ASK THIS NOW', [
          `Work this question in, close to naturally, as your next question: "${TRUST_SIGNAL_QUESTION}"`,
          'Then follow up once on the reason. The reason is the part that is worth anything; a yes or a no on its own is not.',
          'Ask it exactly once. Do not return to it later.',
        ])
      : null,
  ]);
}
