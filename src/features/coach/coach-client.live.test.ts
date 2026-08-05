import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

/**
 * The stronger inference-geo assertion the spec asks for (slice 15): assert on
 * where inference *actually ran* — `response.usage.inference_geo` — not merely
 * that the request carried the parameter. That needs a real API call, so this
 * runs only when `RUN_LIVE_ANTHROPIC=1` (and a key is present); it is skipped in
 * normal CI. Verified passing on `claude-sonnet-5` during slice 15
 * (`usage.inference_geo === 'us'`).
 *
 * The unbypassable half — a request that omits the parameter is rejected by the
 * API — depends on the workspace lock (`allowed_inference_geos: ["us"]`, set in
 * the Console, HITL). Once that is set, add a companion case here asserting an
 * omitted-parameter call throws.
 */
const live = process.env.RUN_LIVE_ANTHROPIC === '1' && !!process.env.ANTHROPIC_API_KEY;

describe.runIf(live)('coach-client — inference runs in the US (live)', () => {
  it('reports usage.inference_geo === "us"', async () => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.COACH_MODEL || 'claude-sonnet-5';
    const response = await client.messages.create({
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      inference_geo: 'us',
    } as Anthropic.MessageCreateParamsNonStreaming);
    expect((response.usage as { inference_geo?: string }).inference_geo).toBe('us');
  });
});
