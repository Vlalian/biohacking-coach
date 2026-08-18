import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * The thin adapter over the Anthropic API — the one place the Coach talks to
 * Claude.
 *
 * `import 'server-only'` makes the boundary a build error, not a convention: any
 * client component that imports this (transitively) fails to compile, so the key
 * can never reach the browser. It is read from `ANTHROPIC_API_KEY` server-side
 * only — there is no key field in the UI and no key in client code (ADR 0006
 * retires the POC's enter-your-key pattern).
 *
 * The core (prompt rendering) stays pure and framework-free; this file is the
 * edge that turns a rendered prompt into a Coach reply.
 */

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Fail before the platform does.
 *
 * The SDK's default timeout is ten minutes and scales up with `max_tokens` —
 * far longer than a serverless function lives, so a slow call would be killed
 * by the platform instead of returning a handled error the UI can show. Sixty
 * seconds is comfortably above a normal Coach reply and well inside the
 * function budget. Retries stay low for the same reason: two attempts at a
 * minute each must still fit.
 */
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;

let cached: Anthropic | undefined;

function getClient(): Anthropic {
  if (!cached) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Add it to .env.local (gitignored) for local ' +
          'development, or as a Vercel environment variable in deployment. The key is a ' +
          'server secret — it must never ship to the browser.',
      );
    }
    cached = new Anthropic({
      apiKey,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }
  return cached;
}

/** The Coach model, overridable per environment; a current Sonnet by default. */
const COACH_MODEL = process.env.COACH_MODEL || 'claude-sonnet-5';

/**
 * Inference runs in the United States, always (slice 15, route 09 / GDPR).
 *
 * `inference_geo` is a top-level `/v1/messages` parameter — not a header, not
 * nested. It is carried on every request here so the consent artifact's promise
 * ("processing runs in the US, under the SCCs in the DPA") is true of every
 * call. The load-bearing half is the workspace lock (`allowed_inference_geos:
 * ["us"]`, set in the Console): with it, a request that omits this parameter or
 * asks for `global` is *rejected by the API*, so the promise does not depend on
 * every future call remembering the parameter. The SDK's param types may not
 * include `inference_geo` yet, so it is added at the call boundary.
 */
const INFERENCE_GEO = 'us';

function withInferenceGeo(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    ...params,
    inference_geo: INFERENCE_GEO,
  } as Anthropic.MessageCreateParamsNonStreaming;
}

/** A tool the Coach may call — the app-side name and the validated input it gave. */
export interface CoachToolCall {
  name: string;
  input: unknown;
}

/**
 * A tool the app offers the Coach, in the app's own terms.
 *
 * This exists so the pure modules that *define* tools never import the Anthropic
 * SDK. `PROPOSE_WEEK_PLAN_TOOL` lives in `weekly-session.ts`, which is
 * framework-free by design — a tool definition is a description of a domain
 * action, not a vendor detail — so it must be expressible without an SDK type.
 *
 * `readonly` throughout because those definitions are declared `as const`. The
 * SDK's own `Tool` type wants mutable arrays, and that mismatch is the entire
 * reason a cast was previously sitting in the service. The cast now happens
 * once, here, in the module that already owns the SDK.
 */
export interface CoachTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: { readonly type: 'object'; readonly [key: string]: unknown };
}

/**
 * A Coach turn: the visible text, plus any tool the Coach called. `toolCalls` is
 * the app's channel for structured proposals (the Week Plan); it never carries
 * the raw Anthropic block shapes, so callers and the transcript stay text-only.
 */
export interface CoachReply {
  text: string;
  toolCalls: CoachToolCall[];
}

/**
 * Thrown when a turn comes back with nothing to say — no text and no tool call.
 *
 * Raised here, in the adapter, rather than left to each caller, because the
 * damage is done by *persisting* it: an empty assistant turn is written into the
 * transcript, shows the athlete a blank Coach message, and is replayed as
 * history on every later request. One throw covers every call site, and every
 * caller already treats a thrown Coach call as a failed turn that writes
 * nothing.
 *
 * Seen in the wild (2026-08-16): an athlete asked to start the Weekly Session
 * and got a blank reply, which persisted; on the next turn the Coach apologised
 * for a message that "seemed to be cut off". `max_tokens` is the likeliest
 * cause — a response can spend its whole budget before emitting a text block —
 * which is why the stop reason travels with the error, where it is the one thing
 * that makes the failure diagnosable.
 */
export class EmptyCoachReplyError extends Error {
  constructor(readonly stopReason: string | null) {
    super(
      `The Coach returned no text and called no tool (stop_reason: ${stopReason ?? 'unknown'}). ` +
        'An empty turn is never stored: the athlete would see a blank message, ' +
        'and it would be replayed as history on every later request.',
    );
    this.name = 'EmptyCoachReplyError';
  }
}

const joinText = (content: Anthropic.ContentBlock[]): string =>
  content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

const toolUsesIn = (content: Anthropic.ContentBlock[]): Anthropic.ToolUseBlock[] =>
  content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');

/**
 * Sends a rendered system prompt and a message history to Claude and returns the
 * Coach's reply.
 *
 * When `tools` are offered and the Coach calls one, the tool round-trip is
 * resolved here, inside the adapter: the tool call is acknowledged with a
 * `tool_result` and one follow-up request, so the Coach can add a closing line
 * ("hit confirm when you're happy"). The structured `tool_use`/`tool_result`
 * blocks live only for that exchange — they are never returned or persisted, so
 * the stored transcript, and every later API turn rebuilt from it, stay plain
 * text with no dangling tool call. A single round-trip only: a tool the Coach
 * calls again in the follow-up is ignored.
 */
export async function callCoach(input: {
  system: string;
  messages: CoachMessage[];
  maxTokens: number;
  tools?: readonly CoachTool[];
  toolResult?: string;
}): Promise<CoachReply> {
  const client = getClient();
  const first = await client.messages.create(
    withInferenceGeo({
      model: COACH_MODEL,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: input.messages,
      ...(input.tools && input.tools.length > 0
        ? { tools: input.tools as unknown as Anthropic.Tool[] }
        : {}),
    }),
  );

  const toolUses = toolUsesIn(first.content);
  if (toolUses.length === 0) {
    const text = joinText(first.content);
    // Nothing to say and nothing to do is not a turn. Refusing here keeps it out
    // of the transcript entirely, rather than storing a blank Coach message the
    // athlete sees and every later request replays.
    if (text === '') throw new EmptyCoachReplyError(first.stop_reason);
    return { text, toolCalls: [] };
  }

  // The Coach proposed something. Acknowledge every tool call and ask for a brief
  // close, so the athlete sees a natural hand-off to the confirm step.
  const ack = input.toolResult ?? 'Presented to the athlete. Await their decision.';
  const second = await client.messages.create(
    withInferenceGeo({
      model: COACH_MODEL,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [
        ...input.messages,
        { role: 'assistant', content: first.content },
        {
          role: 'user',
          content: toolUses.map((use) => ({
            type: 'tool_result' as const,
            tool_use_id: use.id,
            content: ack,
          })),
        },
      ],
    }),
  );

  const text = [joinText(first.content), joinText(second.content)]
    .filter((part) => part !== '')
    .join('\n\n');
  // A tool call with no words around it is still a turn here — the proposal card
  // can carry the meaning — so it is not refused the way a wholly empty reply is.
  // The caller decides: `continueWeeklySession` refuses it when the proposal
  // fails validation, because then there is no card either.
  return {
    text,
    toolCalls: toolUses.map((use) => ({ name: use.name, input: use.input })),
  };
}
