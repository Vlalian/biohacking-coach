import { refusalReason } from '@/lib/identifiers';
import { logCoachFailure } from '@/lib/coach-log';
import { callCoach } from '@/features/coach/coach-client';
import {
  appendMessages,
  createConversation,
  getLatestOpenConversation,
  getMessages,
  getOwnedConversation,
} from '@/features/coach/conversation-repository';
import { toApiMessages, type Message } from '@/features/coach/conversation';
import { buildInterviewPrompt } from './feedback-prompt';
import { trustSignalState, type TrustSignalState } from './feedback';
import { hasTrustSignal, recordTrustSignal } from './feedback-repository';

/**
 * The Feedback Interview — server-side orchestration, mirroring
 * {@link coach-chat-service} turn for turn on purpose: same lazy creation, same
 * ownership checks, same *nothing is written until the model answers* ordering.
 *
 * What it deliberately does **not** mirror is the prompt. This surface is not
 * the Coach (`showable-version/07`), so it imports nothing from
 * `features/coach/prompts` — a test reads this file's imports and fails if that
 * ever changes, because the failure it prevents is silent: a `feedback`
 * transcript reaching a Coach prompt turns a complaint into training talk the
 * Coach then carries for the rest of the test.
 *
 * Importing {@link callCoach} (which is `server-only`) keeps this module off the
 * client by construction, as the Coach services do.
 *
 * {@link sendFeedbackTurn} is written as four named steps rather than one long
 * function. That is not decoration: a turn here is resume → ask → store →
 * record, each of which can refuse, and inlining them put the whole sequence
 * over the complexity ceiling the quality gate enforces.
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
  | { ok: false; reason: 'not-owner' | 'empty' | 'coach-unavailable' | 'unsafe-content' };

/**
 * Sends the tester's turn and returns the interviewer's reply, creating the
 * interview on first use.
 *
 * The Trust Signal is decided here rather than in the prompt: a model told "ask
 * near the end" asks at random, and `CONTEXT.md` says once, near the end. The
 * same decision recognises the *answer* — if the interviewer's last turn carried
 * the question, this turn is the answer to it, and it is stored only after the
 * model call has succeeded, so a failed turn never records an answer the
 * interview never received.
 */
export async function sendFeedbackTurn(
  athleteId: string,
  conversationId: string | null,
  content: string,
  language?: string,
): Promise<SendFeedbackResult> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  const resumed = await resumeInterview(athleteId, conversationId);
  if (!resumed) return { ok: false, reason: 'not-owner' };

  const trustSignal = trustSignalState(resumed.transcript, await hasTrustSignal(athleteId));

  const reply = await interviewerReply(athleteId, resumed, trimmed, {
    askTrustSignal: trustSignal.askNow,
    language,
  });
  if (typeof reply !== 'string') return reply;

  const id = await storeTurn(athleteId, resumed.conversationId, trimmed, reply);
  if (!id) return { ok: false, reason: 'not-owner' };

  await recordAnswerIfGiven(trustSignal, athleteId, id, trimmed);

  return { ok: true, conversationId: id, messages: await getMessages(id) };
}

/** An interview being continued, or a fresh one that does not exist yet. */
interface ResumedInterview {
  /** Null on a first turn — the conversation is minted only once there is a reply to store. */
  conversationId: string | null;
  transcript: Message[];
}

/**
 * Resolves the interview this turn belongs to, or null when the supplied id is
 * not this tester's.
 *
 * Ownership is checked before any work: a forged conversation id must not reach
 * a prompt or an API call, let alone a write (ADR 0006).
 */
async function resumeInterview(
  athleteId: string,
  conversationId: string | null,
): Promise<ResumedInterview | null> {
  if (!conversationId) return { conversationId: null, transcript: [] };

  const owned = await getOwnedConversation(athleteId, conversationId);
  if (!owned) return null;

  return { conversationId, transcript: await getMessages(conversationId) };
}

/**
 * The model call, with its failure translated. Returns the reply text, or the
 * refusal the caller should return unchanged.
 *
 * The `try` wraps the prompt build as well as the call, so a later addition to
 * the prompt cannot turn into an unhandled rejection on the one surface a tester
 * reaches when something has already gone wrong.
 */
async function interviewerReply(
  athleteId: string,
  resumed: ResumedInterview,
  trimmed: string,
  options: { askTrustSignal: boolean; language?: string },
): Promise<string | { ok: false; reason: 'coach-unavailable' | 'unsafe-content' }> {
  try {
    const { text } = await callCoach({
      system: buildInterviewPrompt(options),
      // The tester's turn joins the history here rather than being stored first
      // — the same messages the API would have seen, and no orphan on failure.
      messages: [
        ...toApiMessages(resumed.transcript),
        { role: 'user', content: trimmed },
      ],
      maxTokens: INTERVIEW_MAX_TOKENS,
    });
    return text;
  } catch (error) {
    const reason = refusalReason(error);
    // Without this line a tester who churned after a failed interview looked
    // exactly like one who stopped caring (`showable-version/05` item 2).
    logCoachFailure({
      surface: 'feedback',
      athleteId,
      conversationId: resumed.conversationId,
      error,
      reason,
    });
    return { ok: false, reason };
  }
}

/**
 * Writes the turn and the reply together, minting the interview if this is the
 * first thing the tester actually said. Returns the conversation id, or null
 * when the append was refused as not theirs.
 */
async function storeTurn(
  athleteId: string,
  conversationId: string | null,
  trimmed: string,
  reply: string,
): Promise<string | null> {
  const id =
    conversationId ?? (await createConversation({ athleteId, kind: 'feedback' })).id;

  const appended = await appendMessages(athleteId, id, [
    { role: 'athlete', content: trimmed },
    { role: 'coach_ai', content: reply },
  ]);

  return appended ? id : null;
}

/**
 * Stores the tester's turn as the Trust Signal answer, when that is what it was.
 *
 * After the write, never before: an answer recorded for a turn the interview
 * never received would be an answer to a question nobody can read the context of.
 */
async function recordAnswerIfGiven(
  trustSignal: TrustSignalState,
  athleteId: string,
  conversationId: string,
  trimmed: string,
): Promise<void> {
  if (!trustSignal.answering) return;
  await recordTrustSignal({ athleteId, conversationId, body: trimmed });
}
