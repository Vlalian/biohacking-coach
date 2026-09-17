import { refusalReason, type RefusalReason } from '@/lib/identifiers';
import { logCoachFailure, type ModelSurface } from '@/lib/coach-log';
import type { Citation } from '@/lib/citation';
import type { ConversationKind } from '@/lib/conversation-kinds';
import { noteSourceMentions } from './grounding';
import { callCoach, type CoachReply, type CoachTool, type CoachToolCall } from './coach-client';
import {
  appendMessages,
  createConversation,
  getMessages,
  getOwnedConversation,
} from './conversation-repository';
import { toApiMessages, type Message } from './conversation';

/**
 * One turn of a model-backed conversation, for every surface that has them.
 *
 * Coach Chat and the Feedback Interview are deliberately different in what they
 * say — different prompts, different kinds, one of them explicitly not the Coach
 * (ADR 0009) — and were identical in how a turn is *taken*: check the message is
 * not empty, refuse a conversation that is not this athlete's, render the system
 * prompt, call the model, and write the turn and the reply together afterwards.
 * That sequence was written twice, and the second copy came with the first
 * ticket that needed a second surface.
 *
 * What is shared here is the sequence and its ordering guarantees. What each
 * surface still owns is {@link ConversationTurn.prepare} — the prompt, and
 * anything it wants done once the turn is safely stored.
 *
 * **Nothing is written until the model has answered.** The turn and the reply
 * land together, in one append, after the call returns. Persisting the athlete's
 * message first is the obvious order and the wrong one: the Anthropic call is
 * the step that realistically fails, and doing it second leaves a transcript
 * holding a question with no answer — which the athlete cannot retry without
 * their message appearing twice. Failing before any write means the client can
 * hand the draft back and the conversation is exactly as it was.
 *
 * Importing {@link callCoach} (which is `server-only`) keeps this module, and so
 * every service built on it, off the client by construction.
 */

export interface PreparedTurn {
  /** The system prompt for this turn. */
  system: string;
  /**
   * The tools the Coach may call this turn, and what answers a call
   * (`knowledge-oracle/05`). Both optional: a surface with nothing to offer
   * leaves them out and the adapter behaves as it always did.
   */
  tools?: readonly CoachTool[];
  resolveTool?: (call: CoachToolCall) => Promise<string>;
  /**
   * The sources behind the reply, read **after** the model has answered — the
   * resolver fills them in during the tool round-trip. Stored on the
   * `coach_ai` message so the athlete can see them. None when absent.
   */
  citations?: () => Citation[];
  /**
   * Run once the turn and the reply are stored, never before: work that records
   * something *about* a turn the conversation did not receive is work about
   * nothing. Given the conversation id, which on a first turn did not exist when
   * `prepare` ran, and the reply itself — its tool calls are how a surface
   * learns the Coach proposed something (`training-architecture/20`).
   */
  onStored?: (conversationId: string, reply: CoachReply) => Promise<void>;
}

export interface ConversationTurn {
  athleteId: string;
  kind: ConversationKind;
  /** Which surface to blame in the failure log. */
  surface: ModelSurface;
  /** The conversation being continued, or null to mint one on first use. */
  conversationId: string | null;
  /** What the athlete typed, untrimmed. */
  content: string;
  maxTokens: number;
  /**
   * Renders this surface's system prompt from the stored transcript, and may
   * return work to run after the reply is stored.
   *
   * Called *inside* the failure boundary, so a prompt builder that throws — the
   * identifier assertion does, on app-assembled material — is reported as a
   * refusal rather than becoming an unhandled rejection.
   */
  prepare: (
    storedTranscript: Message[],
    conversationId: string | null,
  ) => Promise<PreparedTurn>;
}

export type ConversationTurnResult =
  | { ok: true; conversationId: string; messages: Message[] }
  | { ok: false; reason: 'not-owner' | 'empty' | RefusalReason };

/**
 * Takes the athlete's turn and returns the reply, creating the conversation on
 * first use.
 *
 * Refuses an empty message, a conversation that is not this athlete's, and a
 * model that could not be reached. `unsafe-content` is told apart from
 * `coach-unavailable` deliberately: "could not be reached" invites a retry, and
 * retrying refused content just fails again.
 */
export async function takeConversationTurn(
  turn: ConversationTurn,
): Promise<ConversationTurnResult> {
  const trimmed = turn.content.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  const resumed = await resumeConversation(turn.athleteId, turn.conversationId, turn.kind);
  if (!resumed) return { ok: false, reason: 'not-owner' };

  const answered = await askModel(turn, resumed, trimmed);
  if ('reason' in answered) return { ok: false, reason: answered.reason };

  const id = await storeTurn(
    turn,
    resumed.conversationId,
    trimmed,
    answered.reply.text,
    answered.prepared,
  );
  if (!id) return { ok: false, reason: 'not-owner' };

  await runAfterStore(turn, answered.prepared, id, answered.reply);

  return { ok: true, conversationId: id, messages: await getMessages(id) };
}

/**
 * Runs the surface's after-the-write work, and never lets it undo the turn.
 *
 * The turn is already stored by this point, so a rejection here must not reach
 * the caller: it would report a failure for a turn the athlete can see in the
 * transcript, and their retry would append the same message and reply a second
 * time. That is the exact duplicate this module's write ordering exists to
 * prevent, arriving through the back door.
 *
 * So the work is best-effort and its failure is logged rather than raised. What
 * it costs is real and worth naming: the Trust Signal answer can be missed while
 * the turn that carried it is kept, and nothing retries it — the question is
 * asked once, so there is no later turn to catch it. A missing answer is a gap
 * in the research data; a duplicated turn is a broken conversation the tester
 * has to look at.
 */
async function runAfterStore(
  turn: ConversationTurn,
  prepared: PreparedTurn,
  conversationId: string,
  reply: CoachReply,
): Promise<void> {
  try {
    await prepared.onStored?.(conversationId, reply);
  } catch (error) {
    logCoachFailure({
      surface: turn.surface,
      athleteId: turn.athleteId,
      conversationId,
      error,
      reason: 'after-store',
    });
  }
}

/** A conversation being continued, or a fresh one that does not exist yet. */
interface ResumedConversation {
  /** Null on a first turn — the conversation is minted only once there is a reply to store. */
  conversationId: string | null;
  transcript: Message[];
}

/**
 * Resolves the conversation this turn belongs to, or null when the supplied id
 * is not this athlete's — or is theirs but is a conversation of another kind.
 *
 * Ownership is checked before any work: a forged conversation id must not reach
 * a prompt or an API call, let alone a write (ADR 0006).
 *
 * The **kind** is checked for a second reason, and it is the guarantee
 * `showable-version/07` exists to protect. Ownership alone is satisfied by every
 * conversation the athlete has, the Feedback Interview included, so a client
 * that sent an interview's id to Coach Chat would have had that transcript
 * resumed into a Coach prompt — and Coach Chat resends its whole transcript on
 * every later turn, so a complaint would be read as something the athlete said
 * about their training for the rest of the test. A surface takes turns in its
 * own conversation or in none.
 */
async function resumeConversation(
  athleteId: string,
  conversationId: string | null,
  kind: ConversationKind,
): Promise<ResumedConversation | null> {
  if (!conversationId) return { conversationId: null, transcript: [] };

  const owned = await getOwnedConversation(athleteId, conversationId);
  if (!owned || owned.kind !== kind) return null;

  return { conversationId, transcript: await getMessages(conversationId) };
}

/**
 * Prompt build and model call, with the failure translated. Returns the reply
 * alongside the prepared turn, or the refusal the caller should report.
 *
 * A reply with no words is refused here, before anything is written. The
 * adapter allows a wordless tool call because it cannot know whether a card
 * will follow; a conversation does know, and the answer is still no — an empty
 * Coach message stored is an empty message shown to the athlete and replayed
 * as history on every later turn. The same rule the Weekly Session has had
 * since its first proposal; it reached the shared turn with
 * `training-architecture/20`, when Coach Chat gained a tool that can be called
 * without prose.
 */
async function askModel(
  turn: ConversationTurn,
  resumed: ResumedConversation,
  trimmed: string,
): Promise<
  | { reply: CoachReply; prepared: PreparedTurn }
  | { reason: RefusalReason }
> {
  try {
    const prepared = await turn.prepare(resumed.transcript, resumed.conversationId);
    const reply = await callCoach({
      system: prepared.system,
      // The athlete's turn joins the history here rather than being stored first
      // — the same messages the API would have seen, and no orphan on failure.
      messages: [...toApiMessages(resumed.transcript), { role: 'user', content: trimmed }],
      maxTokens: turn.maxTokens,
      tools: prepared.tools,
      resolveTool: prepared.resolveTool,
    });
    if (reply.text === '') return { reason: 'coach-unavailable' };
    noteSourceMentions(turn.surface, turn.athleteId, resumed.conversationId, reply.text);
    return { reply, prepared };
  } catch (error) {
    const reason = refusalReason(error);
    // The athlete sees a sentence; without this line the server saw nothing at
    // all, and a tester who churned after a failure looked exactly like one who
    // simply stopped caring (`showable-version/05`, item 2).
    logCoachFailure({
      surface: turn.surface,
      athleteId: turn.athleteId,
      conversationId: resumed.conversationId,
      error,
      reason,
    });
    return { reason };
  }
}

/**
 * Writes the turn and the reply together, minting the conversation if this is
 * the first thing the athlete actually said. Returns the conversation id, or
 * null when the append was refused as not theirs.
 */
async function storeTurn(
  turn: ConversationTurn,
  conversationId: string | null,
  trimmed: string,
  reply: string,
  prepared: PreparedTurn,
): Promise<string | null> {
  const id =
    conversationId ??
    (await createConversation({ athleteId: turn.athleteId, kind: turn.kind })).id;

  const appended = await appendMessages(turn.athleteId, id, [
    { role: 'athlete', content: trimmed },
    // The sources exactly as retrieval supplied them, or none — never anything
    // the model wrote (`citations.ts`).
    { role: 'coach_ai', content: reply, citations: prepared.citations?.() ?? [] },
  ]);

  return appended ? id : null;
}

