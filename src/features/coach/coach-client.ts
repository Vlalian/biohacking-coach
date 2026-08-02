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

/** A tool the Coach may call — the app-side name and the validated input it gave. */
export interface CoachToolCall {
  name: string;
  input: unknown;
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
  tools?: Anthropic.Tool[];
  toolResult?: string;
}): Promise<CoachReply> {
  const client = getClient();
  const first = await client.messages.create({
    model: COACH_MODEL,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: input.messages,
    ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
  });

  const toolUses = toolUsesIn(first.content);
  if (toolUses.length === 0) {
    return { text: joinText(first.content), toolCalls: [] };
  }

  // The Coach proposed something. Acknowledge every tool call and ask for a brief
  // close, so the athlete sees a natural hand-off to the confirm step.
  const ack = input.toolResult ?? 'Presented to the athlete. Await their decision.';
  const second = await client.messages.create({
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
  });

  const text = [joinText(first.content), joinText(second.content)]
    .filter((part) => part !== '')
    .join('\n\n');
  return {
    text,
    toolCalls: toolUses.map((use) => ({ name: use.name, input: use.input })),
  };
}
