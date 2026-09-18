import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `productionGrounding` — the wiring, with every external replaced: the
 * embedder, the corpus search and the events log. What this pins is that a
 * real turn's lookup is counted against the right athlete and surface, with
 * counts and never the question.
 */
const { openAiEmbedder, refusingEmbedder, knowledgeSearch, recordLookupPerformed } = vi.hoisted(
  () => ({
    openAiEmbedder: vi.fn(() => ({ embed: async (texts: string[]) => texts.map(() => [0.1, 0.2]) })),
    refusingEmbedder: vi.fn((reason: string) => ({
      embed: async () => {
        throw new Error(`Refusing to embed: ${reason}`);
      },
    })),
    knowledgeSearch: vi.fn(() => ({
      searchChunks: async () => [
        {
          text: 'Most sessions below the first threshold.',
          ordinal: 3,
          similarity: 0.7,
          source: {
            id: 's1',
            slug: 'seiler-2010',
            title: 'TID',
            authors: 'Seiler S',
            year: 2010,
            doi: null,
            pmcid: null,
            licence: 'CC BY',
            licenceUrl: 'https://cc',
            attribution: 'Seiler 2010',
          },
        },
      ],
    })),
    recordLookupPerformed: vi.fn(async () => {}),
  }),
);
vi.mock('@/features/knowledge-oracle/embedder', () => ({ openAiEmbedder, refusingEmbedder }));
vi.mock('@/features/knowledge-oracle/knowledge-repository', () => ({ knowledgeSearch }));
vi.mock('@/features/knowledge-oracle/lookup-repository', () => ({ recordLookupPerformed }));

const { productionGrounding } = await import('./grounding');

const call = { name: 'look_up_training_science', input: { question: 'why is Thursday easy?' } };

beforeEach(() => {
  openAiEmbedder.mockClear();
  refusingEmbedder.mockClear();
  recordLookupPerformed.mockClear();
  process.env.OPENAI_API_KEY = 'sk-test';
});

describe('productionGrounding', () => {
  it('embeds with OpenAI, searches the corpus, and counts the lookup against the athlete and surface', async () => {
    const g = productionGrounding({
      athleteId: 'a1',
      surface: 'weekly_session',
      conversationId: 'conv_9',
    });
    const text = await g.resolve(call);

    expect(openAiEmbedder).toHaveBeenCalledTimes(1);
    expect(refusingEmbedder).not.toHaveBeenCalled();
    expect(text).toContain('[1] Seiler S (2010)');
    expect(g.citations()).toHaveLength(1);
    expect(recordLookupPerformed).toHaveBeenCalledWith('a1', {
      surface: 'weekly_session',
      conversationId: 'conv_9',
      questionLength: 21,
      passages: 1,
      citations: 1,
    });
  });

  it('uses the refusing embedder when the key is absent, and logs the outage against the surface — never the message', async () => {
    delete process.env.OPENAI_API_KEY;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const g = productionGrounding({ athleteId: 'a1', surface: 'coach_chat', conversationId: null });
    await expect(g.resolve(call)).resolves.toContain('Lookup unavailable');
    expect(refusingEmbedder).toHaveBeenCalledWith(expect.stringContaining('OPENAI_API_KEY is not set'));
    expect(openAiEmbedder).not.toHaveBeenCalled();
    expect(recordLookupPerformed).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    const line = JSON.parse(error.mock.calls[0][0] as string);
    expect(line).toEqual({
      event: 'lookup_failed',
      surface: 'coach_chat',
      athleteId: 'a1',
      conversationId: null,
      errorType: 'error',
    });
    expect(error.mock.calls[0][0]).not.toContain('OPENAI_API_KEY');
    error.mockRestore();
  });
});
