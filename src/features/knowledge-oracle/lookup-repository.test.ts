import { describe, it, expect, vi } from 'vitest';

const inserted: unknown[] = [];
const values = vi.fn((v: unknown) => {
  inserted.push(v);
  return Promise.resolve();
});
vi.mock('@/db', () => ({ getDb: () => ({ insert: () => ({ values }) }) }));

const { recordLookupPerformed, LOOKUP_PERFORMED_EVENT } = await import('./lookup-repository');

describe('recordLookupPerformed', () => {
  it('writes a coach_ai event carrying counts and nothing else', async () => {
    await recordLookupPerformed('athlete_1', {
      surface: 'coach_chat',
      conversationId: 'c1',
      questionLength: 21,
      passages: 2,
      citations: 1,
    });

    expect(inserted).toEqual([
      {
        athleteId: 'athlete_1',
        actorType: 'coach_ai',
        type: LOOKUP_PERFORMED_EVENT,
        payload: { surface: 'coach_chat', conversationId: 'c1', questionLength: 21, passages: 2, citations: 1 },
      },
    ]);
    expect(LOOKUP_PERFORMED_EVENT).toBe('lookup_performed');
  });
});
