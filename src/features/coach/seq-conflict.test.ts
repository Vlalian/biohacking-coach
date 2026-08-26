import { describe, it, expect } from 'vitest';
import { isSeqConflict, SEQ_RETRIES } from './seq-conflict';

describe('isSeqConflict', () => {
  it('recognises the Postgres unique-violation code', () => {
    expect(isSeqConflict(Object.assign(new Error('x'), { code: '23505' }))).toBe(true);
  });

  it('recognises the index by name, for drivers that only give a message', () => {
    // The neon-http driver does not always surface `code`, so the message is a
    // real second path rather than belt-and-braces.
    expect(
      isSeqConflict(new Error('duplicate key value violates unique constraint "messages_conversation_seq_idx"')),
    ).toBe(true);
  });

  it('does not swallow an unrelated failure', () => {
    // The point of a narrow predicate: a dead connection or a constraint this
    // code got wrong must surface, not be retried three times and hidden.
    expect(isSeqConflict(new Error('connection terminated'))).toBe(false);
    expect(isSeqConflict(Object.assign(new Error('x'), { code: '23503' }))).toBe(false);
    expect(isSeqConflict(null)).toBe(false);
    expect(isSeqConflict(undefined)).toBe(false);
  });

  it('is bounded, so a persistent failure surfaces rather than spinning', () => {
    expect(SEQ_RETRIES).toBeGreaterThan(0);
    expect(SEQ_RETRIES).toBeLessThan(10);
  });
});
