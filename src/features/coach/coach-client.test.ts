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

/**
 * Reported by Mads on 2026-08-16, from the running app: he asked the Coach to
 * start the Weekly Session and got a *blank* Coach message, which persisted in
 * the thread. On the next turn the Coach apologised for a message that "seemed
 * to be cut off". The empty turn had been written to the transcript, so it was
 * also being replayed as history on every later request.
 */
describe('callCoach — an empty turn is refused, never returned', () => {
  it('throws when the reply carries no text and no tool call', async () => {
    create.mockResolvedValue({ content: [], usage: {}, stop_reason: 'max_tokens' });

    await expect(
      callCoach({ system: 'S', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 }),
    ).rejects.toThrow(/no text and called no tool/i);
  });

  it('carries the stop reason, so a truncated reply is diagnosable', async () => {
    create.mockResolvedValue({ content: [], usage: {}, stop_reason: 'max_tokens' });

    await expect(
      callCoach({ system: 'S', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 }),
    ).rejects.toThrow(/max_tokens/);
  });

  it('throws when the only blocks are non-text — a thinking-only turn', async () => {
    // The realistic shape of the reported bug: the budget went on something
    // other than a text block, so `joinText` produced ''.
    create.mockResolvedValue({
      content: [{ type: 'thinking', thinking: '...' }],
      usage: {},
      stop_reason: 'max_tokens',
    });

    await expect(
      callCoach({ system: 'S', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 }),
    ).rejects.toThrow(/no text and called no tool/i);
  });

  it('returns a normal reply unchanged', async () => {
    create.mockResolvedValue({
      content: [{ type: 'text', text: 'Easy day.' }],
      usage: {},
      stop_reason: 'end_turn',
    });

    const reply = await callCoach({
      system: 'S',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
    });

    expect(reply).toMatchObject({ text: 'Easy day.', toolCalls: [] });
  });

  it('allows a tool call with no words around it — the card carries the meaning', async () => {
    // Not the same failure: a proposal with no prose is still a turn, because
    // the athlete sees the confirm card. Only a wholly empty reply is refused.
    create
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 't1', name: 'propose_week_plan', input: { s: 1 } }],
        usage: {},
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce({ content: [], usage: {}, stop_reason: 'end_turn' });

    const reply = await callCoach({
      system: 'S',
      messages: [{ role: 'user', content: 'plan my week' }],
      maxTokens: 100,
      tools: [{ name: 'propose_week_plan' } as never],
    });

    expect(reply.text).toBe('');
    expect(reply.toolCalls).toEqual([{ name: 'propose_week_plan', input: { s: 1 } }]);
  });
});

/**
 * `knowledge-oracle/05`. The lookup tool needs a result computed from the
 * call's input, so the adapter takes a per-call resolver. The plan-proposal
 * path keeps its fixed acknowledgement — nothing about it changes.
 */
describe('callCoach — a per-call tool resolver', () => {
  const twoTools = () =>
    create
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 't1', name: 'look_up_training_science', input: { question: 'why easy?' } },
          { type: 'tool_use', id: 't2', name: 'propose_week_plan', input: {} },
        ],
        usage: {},
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'closing' }], usage: {} });

  it('sends each tool use its own resolver output as its tool_result', async () => {
    twoTools();

    await callCoach({
      system: 'S',
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 100,
      tools: [{ name: 'look_up_training_science', description: 'd', input_schema: { type: 'object' } }],
      resolveTool: async (call) => `resolved:${call.name}:${JSON.stringify(call.input)}`,
    });

    const followUp = create.mock.calls[1][0].messages.at(-1).content;
    expect(followUp).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: 'resolved:look_up_training_science:{"question":"why easy?"}' },
      { type: 'tool_result', tool_use_id: 't2', content: 'resolved:propose_week_plan:{}' },
    ]);
    // The exchange the API expects: the model's own turn echoed back as the
    // assistant, then the results as the user — and the tools offered up front.
    const messages = create.mock.calls[1][0].messages;
    expect(messages.at(-2).role).toBe('assistant');
    expect(messages.at(-1).role).toBe('user');
    expect(create.mock.calls[0][0].tools).toEqual([
      { name: 'look_up_training_science', description: 'd', input_schema: { type: 'object' } },
    ]);
  });

  it('offers no tools parameter at all when none are given', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: 'hi' }], usage: {} });
    await callCoach({ system: 'S', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
    expect(create.mock.calls[0][0]).not.toHaveProperty('tools');
    await callCoach({ system: 'S', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, tools: [] });
    expect(create.mock.calls[1][0]).not.toHaveProperty('tools');
  });

  it('falls back to the fixed acknowledgement when no resolver is given', async () => {
    twoTools();

    await callCoach({
      system: 'S',
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 100,
      tools: [{ name: 'propose_week_plan', description: 'd', input_schema: { type: 'object' } }],
    });

    const followUp = create.mock.calls[1][0].messages.at(-1).content;
    expect(followUp.map((r: { content: string }) => r.content)).toEqual([
      'Presented to the athlete. Await their decision.',
      'Presented to the athlete. Await their decision.',
    ]);
  });

  it('turns a throwing resolver into the unavailable result and still returns a reply', async () => {
    twoTools();

    const reply = await callCoach({
      system: 'S',
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 100,
      tools: [{ name: 'look_up_training_science', description: 'd', input_schema: { type: 'object' } }],
      resolveTool: async () => {
        throw new Error('embedder down');
      },
    });

    expect(reply.text).toBe('closing');
    const followUp = create.mock.calls[1][0].messages.at(-1).content;
    expect(followUp[0].content).toBe(
      'Lookup unavailable. Answer without grounding and say that you have none.',
    );
  });
});

describe('callCoach — a turn that both speaks and calls a tool', () => {
  it('joins the words before the call and the words after it with a blank line between', async () => {
    create
      .mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Let me check that.' },
          { type: 'tool_use', id: 't1', name: 'look_up_training_science', input: { question: 'q' } },
        ],
        usage: {},
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Thursday stays easy.' }], usage: {} });

    const reply = await callCoach({
      system: 'S',
      messages: [{ role: 'user', content: 'why?' }],
      maxTokens: 100,
      tools: [{ name: 'look_up_training_science', description: 'd', input_schema: { type: 'object' } }],
      resolveTool: async () => '[1] passage',
    });

    expect(reply.text).toBe('Let me check that.\n\nThursday stays easy.');
    expect(reply.toolCalls).toEqual([{ name: 'look_up_training_science', input: { question: 'q' } }]);
  });
});
