import { describe, it, expect } from 'vitest';
import {
  assertNoDirectIdentifier,
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

describe('assertNoDirectIdentifier', () => {
  /**
   * Moved here from `features/coach/check-in.ts` for `knowledge-oracle/03`. The
   * Knowledge Oracle needs the same guard on its query, and reaching into the
   * Coach feature for it would be feature-to-feature coupling against that
   * ticket's own "dependencies flow toward the core" criterion.
   *
   * `lib/coach-log.ts` was already importing it out of the Coach feature, so
   * `lib/` depended on `features/` — backwards. Its two dependencies were always
   * here; only the walk was in the wrong place.
   */
  it('passes a value with nothing identifier-shaped in it', () => {
    expect(() =>
      assertNoDirectIdentifier({ phase: 'build', note: 'easy 90 min spin' }),
    ).not.toThrow();
  });

  it('throws on a shaped identifier nested in a free-text leaf', () => {
    // The deep walk is the point: an identifier hides in a session note, not in
    // a top-level scalar.
    expect(() =>
      assertNoDirectIdentifier({ week: [{ note: 'ping jane@example.com' }] }),
    ).toThrow(DirectIdentifierError);
  });

  it('walks a bare array, not only arrays nested inside an object', () => {
    expect(() =>
      assertNoDirectIdentifier(['easy spin', 'ping jane@example.com']),
    ).toThrow(DirectIdentifierError);
  });

  it('walks the values of a plain object', () => {
    expect(() => assertNoDirectIdentifier({ note: 'jane@example.com' })).toThrow(
      DirectIdentifierError,
    );
  });

  it('passes non-string leaves through untouched', () => {
    // Numbers, booleans, null and undefined have no shape to match. A guard that
    // threw on them would make every prompt input unusable.
    expect(() =>
      assertNoDirectIdentifier({ pulse: 55, ok: true, note: null, missing: undefined }),
    ).not.toThrow();
  });
});
describe('gaps the hardening gate found in this file', () => {
  /**
   * All four pre-date `knowledge-oracle/03` and none was caused by it. They are
   * closed here because that ticket moved `assertNoDirectIdentifier` into this
   * module, and leaving a privacy guard's own regex boundary untested while
   * working in the file would be the exact thing the gate exists to stop.
   */
  it('names itself, so a caller can tell this apart from an upstream failure', () => {
    // `refusalReason` branches on `instanceof`, but logs and error reporting read
    // `name` — and the split decides whether an athlete is shown a retry that can
    // possibly work.
    const error = new DirectIdentifierError('email');

    expect(error.name).toBe('DirectIdentifierError');
    expect(error.message).toContain('email');
    expect(error.message).toContain('GDPR decision 1');
  });

  it('treats a non-string as free of identifiers', () => {
    // There is nothing to match in a number or a null, and a validator that said
    // otherwise would refuse ordinary input.
    expect(isFreeOfShapedIdentifiers(null)).toBe(true);
    expect(isFreeOfShapedIdentifiers(undefined)).toBe(true);
  });

  it('is free of identifiers for clean prose and not for dirty', () => {
    expect(isFreeOfShapedIdentifiers('easy 90 min spin, felt good')).toBe(true);
    expect(isFreeOfShapedIdentifiers('mail jane@example.com')).toBe(false);
  });

  it('matches a phone-shaped run only from eight digits up', () => {
    // The boundary is the whole design of this pattern: it has to be loose enough
    // to catch a number and tight enough that ordinary training prose survives.
    // Seven digits is under the floor; eight is on it.
    expect(shapedIdentifierIn('1234567')).toBeNull();
    expect(shapedIdentifierIn('12345678')).toBe('phone');
    expect(shapedIdentifierIn('+45 12 34 56 78')).toBe('phone');

    // ...and stops at fifteen. E.164 caps an international number at 15 digits,
    // so a longer run is not a phone number — it is an id, a hash or a file
    // number, and claiming otherwise would refuse ordinary content.
    expect(shapedIdentifierIn('123456789012345')).toBe('phone');
    expect(shapedIdentifierIn('1234567890123456')).toBeNull();
  });

  it('applies the same fifteen-digit ceiling to a +-prefixed number', () => {
    // The bare-run branch was tested at its ceiling and the `+` branch was not,
    // and the two disagreed: `\+\d[\d\s-]{6,16}\d` counted characters, so the
    // separator class filled the quota and eighteen digits passed a rule this
    // module documents as 8-15. It fails closed, so nothing leaked — it refused
    // athlete content carrying a long numeric id and blamed contact details.
    expect(shapedIdentifierIn('+12345678901234')).toBe('phone');
    expect(shapedIdentifierIn('+123456789012345')).toBe('phone');
    expect(shapedIdentifierIn('+1234567890123456')).toBeNull();
    expect(shapedIdentifierIn('+123456789012345678')).toBeNull();
  });

  it('leaves ordinary training numbers alone', () => {
    // The values this guard sits in front of, every day: a date, a duration, a
    // pulse and an interval set. A regex that ate these would make the guard
    // unusable and someone would delete it.
    for (const clean of ['2026-08-18', '90 min', '55bpm', '4x800m', 'zone 2']) {
      expect(shapedIdentifierIn(clean)).toBeNull();
    }
  });
});


describe('isFreeOfShapedIdentifiers on values that are not strings', () => {
  it('treats a non-string as free of identifiers, whatever it stringifies to', () => {
    // Its caller is a write boundary taking client-supplied data, so a non-string
    // genuinely arrives. `RegExp.test` coerces, so without the `typeof` guard an
    // array holding a phone-shaped string would be refused as carrying contact
    // details — while every other non-string passes. The guard is what keeps the
    // answer consistent.
    expect(isFreeOfShapedIdentifiers(['+4512345678'])).toBe(true);
    expect(isFreeOfShapedIdentifiers({ phone: '12345678' })).toBe(true);
    expect(isFreeOfShapedIdentifiers(12345678)).toBe(true);
  });
});
