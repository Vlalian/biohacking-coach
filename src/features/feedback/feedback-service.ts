import {
  getLatestOpenConversation,
  getMessages,
} from '@/features/coach/conversation-repository';
import { takeConversationTurn } from '@/features/coach/conversation-turn';
import type { Message } from '@/features/coach/conversation';
import { buildInterviewPrompt } from './feedback-prompt';
import { trustSignalState } from './feedback';
import { hasTrustSignal, recordTrustSignal } from './feedback-repository';

/**
 * The Feedback Interview — server-side orchestration.
 *
 * A turn here is taken by {@link takeConversationTurn}, the same machinery Coach
 * Chat uses: same ownership checks, same *nothing is written until the model
 * answers* ordering. Sharing the sequence is safe; sharing the prompt would not
 * be, and is the thing this module exists to keep separate.
 *
 * This surface is not the Coach (`showable-version/07`, ADR 0009), so it imports
 * nothing from `features/coach/prompts` — `feedback-isolation.test.ts` reads this
 * file's imports and fails if that ever changes, because the failure it prevents
 * is silent: a `feedback` transcript reaching a Coach prompt turns a complaint
 * into training talk the Coach then carries for the rest of the test.
 */

const INTERVIEW_MAX_TOKENS = 800;

export interface InterviewState {
  conversationId: string;
  messages: Message[];
}

/**
 * The tester's open interview, resumed — or null if they have never started one.
 *
 * Read-only, and that is the point: reaching the escape hatch must cost nothing.
 * A tester who opens it, reads the page and leaves has not started an interview,
 * and no empty conversation is left behind to be read as one.
 */
export async function getOpenInterview(athleteId: string): Promise<InterviewState | null> {
  const open = await getLatestOpenConversation(athleteId, 'feedback');
  if (!open) return null;
  return { conversationId: open.id, messages: await getMessages(open.id) };
}

export type SendFeedbackResult =
  | { ok: true; conversationId: string; messages: Message[] }
  | { ok: false; reason: 'not-owner' | 'empty' | 'coach-unavailable' };

/**
 * Sends the tester's turn and returns the interviewer's reply, creating the
 * interview on first use.
 *
 * The Trust Signal is decided here rather than in the prompt: a model told "ask
 * near the end" asks at random, and `CONTEXT.md` says once, near the end. The
 * same decision recognises the *answer*, and it is recorded through `onStored`,
 * so a failed turn never records an answer the interview never received.
 */
export async function sendFeedbackTurn(
  athleteId: string,
  conversationId: string | null,
  content: string,
  language?: string,
): Promise<SendFeedbackResult> {
  const result = await takeConversationTurn({
    athleteId,
    kind: 'feedback',
    surface: 'feedback',
    conversationId,
    content,
    maxTokens: INTERVIEW_MAX_TOKENS,
    prepare: async (transcript) => {
      const trustSignal = trustSignalState(transcript, await hasTrustSignal(athleteId));

      return {
        system: buildInterviewPrompt({ askTrustSignal: trustSignal.askNow, language }),
        onStored: trustSignal.answering
          ? (interviewId) =>
              recordTrustSignal({
                athleteId,
                conversationId: interviewId,
                body: content.trim(),
              })
          : undefined,
      };
    },
  });

  // `unsafe-content` cannot happen here, so the tester is never shown it. It
  // arises when a prompt builder's identifier assertion throws over material the
  // *app* assembled from the athlete's record — a session note, an equipment
  // item — and the interview prompt assembles none of that: it takes a boolean
  // and the Athlete Language. The tester's own free text is a user message, not
  // prompt material, and is covered by the consent disclosure rather than by a
  // filter (`lib/identifiers.ts`). The failure log still tells the two apart if
  // that ever stops being true.
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === 'unsafe-content' ? 'coach-unavailable' : result.reason,
    };
  }
  return result;
}
