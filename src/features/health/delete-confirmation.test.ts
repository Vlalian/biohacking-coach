import { describe, expect, it } from 'vitest';
import { confirmationKey } from './delete-confirmation';

// CodeRabbit on PR #111: a confirm armed on an open record must not carry over
// when that record is closed and reappears in History with the same id.
describe('confirmationKey', () => {
  it('keeps the open-record confirm and the History confirm apart for the same record', () => {
    expect(confirmationKey('open', 'r1')).not.toBe(confirmationKey('history', 'r1'));
  });

  it('is the same key for the same record in the same section', () => {
    expect(confirmationKey('history', 'r1')).toBe(confirmationKey('history', 'r1'));
    expect(confirmationKey('open', 'r1')).not.toBe(confirmationKey('open', 'r2'));
  });
});
