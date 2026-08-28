import { describe, it, expect } from 'vitest';
import { assertNoDirectIdentifier, assertNoIdentity, type CheckIn } from './check-in';

/**
 * The runtime backstop behind GDPR decision 1.
 *
 * These tests lock the guard's *stated* scope, not a wished-for one. AGENTS.md
 * names four identifiers — name, email, DOB, location — and the primary control
 * for all four is structural (ADR 0006: training tables carry no identity
 * column). This function is the second layer, over athlete free text, where only
 * some identifiers have a recognisable shape. So the tests come in two halves:
 * what it must catch, and what it must NOT flag — because a guard that fires on
 * ordinary training prose gets deleted by whoever it blocks next.
 */

const BASE: CheckIn = {
  readiness: { body: 7, mental: 7, energy: 7, sleep: 7, pulse: 50 },
};

describe('assertNoDirectIdentifier — what it catches', () => {
  it('an email in a top-level string', () => {
    expect(() => assertNoDirectIdentifier('reach me at jane@example.com')).toThrow(/email/i);
  });

  it('an email hidden in a nested free-text leaf', () => {
    expect(() =>
      assertNoDirectIdentifier({
        type: 'Endurance',
        note: { athlete: 'ping me — jane.realname@example.com' },
      }),
    ).toThrow(/email/i);
  });

  it('an email inside an array element', () => {
    expect(() => assertNoDirectIdentifier(['fine', 'also fine', 'x@y.dk'])).toThrow(/email/i);
  });

  it('an international phone number', () => {
    expect(() => assertNoDirectIdentifier('call me on +45 20 12 34 56')).toThrow(/phone/i);
  });

  it('a bare eight-digit phone run', () => {
    expect(() => assertNoDirectIdentifier('my number is 20123456')).toThrow(/phone/i);
  });
});

describe('assertNoDirectIdentifier — what it must not flag', () => {
  // Every string here is real training prose the Coach legitimately sees. A
  // false positive on any of them would throw mid-conversation.
  const ORDINARY = [
    'Imported from GPX',
    '2026-08-18',
    '90 min',
    'Z2',
    '55bpm',
    '4x800m off 90s',
    'Ironman Copenhagen 2026-08-16',
    'swam 3800m, felt strong',
    'body 7/10, mind 8/10',
    'sleep 7.5h, pulse 55',
    'Base Building',
    'ride with the Tuesday group, 120km',
  ];

  it.each(ORDINARY)('leaves ordinary training text alone: %s', (text) => {
    expect(() => assertNoDirectIdentifier(text)).not.toThrow();
  });

  it('walks numbers and nullish leaves without throwing', () => {
    expect(() =>
      assertNoDirectIdentifier({ body: 7, sleep: 7.5, note: null, tags: undefined }),
    ).not.toThrow();
  });

  it('does not pretend to catch a name — that is the structural layer, not this one', () => {
    // Documented, deliberate limit: no pattern recognises a name in prose. This
    // test exists so nobody later reads the guard as a name filter. The promise
    // that no *stored* name reaches a prompt is kept by ADR 0006's identity
    // separation and by assertNoIdentity's personaName refusal below.
    expect(() => assertNoDirectIdentifier('long ride with Lars in Odense')).not.toThrow();
  });
});

describe('assertNoIdentity — the check-in seam', () => {
  it('refuses a check-in carrying personaName at all', () => {
    expect(() => assertNoIdentity({ ...BASE, personaName: 'Mads' })).toThrow(/personaName/);
  });

  it('accepts a check-in with no identity', () => {
    expect(() => assertNoIdentity(BASE)).not.toThrow();
  });

  it('still walks the check-in for shaped identifiers', () => {
    expect(() =>
      assertNoIdentity({ ...BASE, raceTarget: 'email me at coach@example.com' }),
    ).toThrow(/email/i);
  });
});
