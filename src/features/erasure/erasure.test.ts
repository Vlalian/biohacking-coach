import { describe, it, expect } from 'vitest';
import { DISCLOSURE_VERSION } from '@/features/consent/disclosure';
import { erasureLogCutoff, erasurePlan, toErasureLogEntry } from './erasure';

describe('erasurePlan', () => {
  it('deletes the athlete row before the user row', () => {
    const plan = erasurePlan({ coachId: null });

    expect(plan.indexOf('athlete')).toBeLessThan(plan.indexOf('user'));
  });

  it('does not attempt a coach delete for an athlete who holds no coach row', () => {
    expect(erasurePlan({ coachId: null })).toEqual(['athlete', 'user']);
  });

  it('deletes the coach row too, before the user row, for an athlete who is also a Head Coach', () => {
    const plan = erasurePlan({ coachId: 'coach-1' });

    expect(plan).toContain('coach');
    expect(plan.indexOf('coach')).toBeLessThan(plan.indexOf('user'));
    expect(plan.indexOf('athlete')).toBeLessThan(plan.indexOf('coach'));
  });
});

describe('toErasureLogEntry', () => {
  it('carries the purposes and the version each was granted under', () => {
    const entry = toErasureLogEntry(
      [
        { purpose: 'ai_coaching', disclosureVersion: '2026-08-07' },
        { purpose: 'health_data', disclosureVersion: '2026-08-07' },
      ],
      DISCLOSURE_VERSION,
    );

    expect(entry.consentedPurposes).toEqual([
      { purpose: 'ai_coaching', disclosureVersion: '2026-08-07' },
      { purpose: 'health_data', disclosureVersion: '2026-08-07' },
    ]);
  });

  // A stale-version grant on an OPTIONAL purpose stays active until superseded
  // (`grantConsent` only supersedes the purpose being granted), so the versions
  // in one athlete's active set can genuinely differ. Collapsing them to a
  // single version would misrecord what was consented to.
  it('keeps a stale-version grant at its own version rather than collapsing them', () => {
    const entry = toErasureLogEntry(
      [
        { purpose: 'ai_coaching', disclosureVersion: '2026-08-07' },
        { purpose: 'product_improvement', disclosureVersion: '2026-01-01' },
      ],
      DISCLOSURE_VERSION,
    );

    expect(entry.consentedPurposes).toContainEqual({
      purpose: 'product_improvement',
      disclosureVersion: '2026-01-01',
    });
  });

  // The version in force at erasure is supplied by the caller, so this asserts
  // the entry echoes what it was GIVEN — deliberately a value that matches none
  // of the grants, which the old assertion against the imported constant could
  // not distinguish from the module reading that constant for itself.
  it('records the disclosure version it is given, not one carried by a grant', () => {
    const entry = toErasureLogEntry(
      [{ purpose: 'ai_coaching', disclosureVersion: '2026-01-01' }],
      '2026-08-07',
    );

    expect(entry.disclosureVersion).toBe('2026-08-07');
  });

  it('records the disclosure version in force at the moment of erasure', () => {
    const entry = toErasureLogEntry([], DISCLOSURE_VERSION);

    expect(entry.disclosureVersion).toBe(DISCLOSURE_VERSION);
  });

  it('records an athlete who consented to nothing without failing', () => {
    expect(toErasureLogEntry([], DISCLOSURE_VERSION).consentedPurposes).toEqual([]);
  });

  // Behaviour 5, and the reason this table exists at all: the log proves a
  // consent was given without retaining anything that points at the person who
  // gave it. Asserted against the entry's own keys, not assumed from the shape
  // of the code that builds it.
  it('carries no athlete id, no user id, no email and no name', () => {
    const entry = toErasureLogEntry(
      [{ purpose: 'ai_coaching', disclosureVersion: DISCLOSURE_VERSION }],
      DISCLOSURE_VERSION,
    );

    expect(Object.keys(entry).sort()).toEqual([
      'consentedPurposes',
      'disclosureVersion',
    ]);
  });
});

describe('erasureLogCutoff', () => {
  it('keeps an erasure record three years, to the day', () => {
    expect(erasureLogCutoff(new Date('2029-11-02T03:17:00Z'))).toEqual(new Date('2026-11-02T03:17:00Z'));
  });

  it('on a leap day, stops at the 28th of February three years before — never the 1st of March (CodeRabbit, PR #130)', () => {
    // A record erased on 1 March 2025 is three years old only on 1 March 2028.
    // Rolling 29 February into 1 March would delete it a day early.
    expect(erasureLogCutoff(new Date('2028-02-29T03:17:00Z'))).toEqual(new Date('2025-02-28T03:17:00Z'));
    expect(new Date('2025-03-01T01:00:00Z') < erasureLogCutoff(new Date('2028-02-29T03:17:00Z'))).toBe(false);
  });

  it('keeps every other date’s day of the month', () => {
    expect(erasureLogCutoff(new Date('2028-03-01T00:00:00Z'))).toEqual(new Date('2025-03-01T00:00:00Z'));
    expect(erasureLogCutoff(new Date('2027-12-31T23:59:59Z'))).toEqual(new Date('2024-12-31T23:59:59Z'));
  });
});
