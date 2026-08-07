import { describe, it, expect, vi, beforeEach } from 'vitest';

// `server-only` throws outside a React Server Component bundle; stub it so the
// adapter can be imported in a plain test. The Anthropic SDK is replaced with a
// fake whose `messages.create` records the params it was handed.
vi.mock('server-only', () => ({}));

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

const { callCoach } = await import('./coach-client');

beforeEach(() => {
  create.mockReset();
});

describe('callCoach — inference_geo is carried on every request (slice 15)', () => {
  it('the primary call passes inference_geo: "us" as a top-level parameter', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: 'hi' }], usage: {} });

    await callCoach({ system: 'S', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0];
    expect(params.inference_geo).toBe('us');
    // Top-level, not nested and not a header.
    expect(params.model).toBeDefined();
  });

  it('the tool-round-trip follow-up call also passes inference_geo: "us"', async () => {
    // First reply calls a tool; the adapter issues a second request to close.
    create
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 't1', name: 'propose', input: {} }],
        usage: {},
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'done' }], usage: {} });

    await callCoach({
      system: 'S',
      messages: [{ role: 'user', content: 'plan my week' }],
      maxTokens: 100,
      tools: [{ name: 'propose', description: 'd', input_schema: { type: 'object' } }],
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].inference_geo).toBe('us');
    expect(create.mock.calls[1][0].inference_geo).toBe('us');
  });
});
