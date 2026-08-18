import { describe, it, expect } from 'vitest';
import {
  DirectIdentifierError,
  isFreeOfShapedIdentifiers,
  refusalReason,
  shapedIdentifierIn,
} from './identifiers';

/**
 * The identifier guard, and the refusal split that hangs off it.
 *
 * `refusalReason` became shared when the three Coach services turned out to be
 * making the same call in four places. It is one line, and it is tested anyway,
 * because the thing it decides is athlete-facing: whether they are shown a retry
 * that can work, or one that will fail identically every time.
 */

describe('shapedIdentifierIn', () => {
  it('recognises an email in free text', () => {
    expect(shapedIdentifierIn('reach me at jane@example.com')).not.toBeNull();
  });

  it('leaves ordinary coaching prose alone', () => {
    // The guard recognises shapes, not names — this is the documented limit,
    // and a test that pretended otherwise would misrepresent the guarantee.
    expect(shapedIdentifierIn('felt strong on the Thursday brick, Z2 the whole way')).toBeNull();
  });
});

describe('isFreeOfShapedIdentifiers', () => {
  it('treats null and undefined as free — there is nothing to match', () => {
    expect(isFreeOfShapedIdentifiers(null)).toBe(true);
    expect(isFreeOfShapedIdentifiers(undefined)).toBe(true);
  });

  it('refuses a string carrying a shaped identifier', () => {
    expect(isFreeOfShapedIdentifiers('jane@example.com')).toBe(false);
  });
});

describe('refusalReason', () => {
  it('calls a refused identifier unsafe-content, not an unreachable Coach', () => {
    // The load-bearing case. Reported as 'coach-unavailable', the UI would offer
    // a retry that re-sends the same refused content and fails the same way.
    expect(refusalReason(new DirectIdentifierError('email'))).toBe('unsafe-content');
  });

  it('calls anything else coach-unavailable, which is the retryable one', () => {
    expect(refusalReason(new Error('fetch failed'))).toBe('coach-unavailable');
  });

  it('is safe on a non-Error throw', () => {
    // Nothing guarantees a thrown value is an Error — a rejected fetch or a
    // stray `throw 'boom'` both land here, and both are retryable.
    expect(refusalReason('boom')).toBe('coach-unavailable');
    expect(refusalReason(undefined)).toBe('coach-unavailable');
  });
});
