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
 * Sends a rendered system prompt and a message history to Claude and returns the
 * reply text. Only text content blocks are joined — the Coach never emits tools
 * or images.
 */
export async function callCoach(input: {
  system: string;
  messages: CoachMessage[];
  maxTokens: number;
}): Promise<string> {
  const response = await getClient().messages.create({
    model: COACH_MODEL,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: input.messages,
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}
