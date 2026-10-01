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

  it('recognises the conflict inside the error drizzle wraps it in', async () => {
    // drizzle >= 0.44 throws a DrizzleQueryError for every failed query, on
    // neon-http as on every driver: the message becomes "Failed query: ..."
    // and the driver's own error, with its code, moves to `cause`. Read only
    // at the top, the retry never fired against a real database.
    const { DrizzleQueryError } = await import('drizzle-orm/errors');
    const driverError = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    expect(isSeqConflict(new DrizzleQueryError('insert into "messages" ...', [], driverError))).toBe(true);
    expect(
      isSeqConflict(new DrizzleQueryError('insert ...', [], Object.assign(new Error('fk'), { code: '23503' }))),
    ).toBe(false);
  });

  it('recognises either marker on its own', () => {
    expect(isSeqConflict(new Error('insert failed on "messages_conversation_seq_idx"'))).toBe(true);
    expect(isSeqConflict(new Error('duplicate key value violates unique constraint'))).toBe(true);
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
