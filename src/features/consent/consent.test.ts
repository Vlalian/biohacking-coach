import { describe, it, expect } from 'vitest';
import {
  isConsented,
  missingRequiredConsents,
  currentlyConsentedPurposes,
  type ActiveConsent,
} from './consent';
import {
  CONSENT_PURPOSES,
  REQUIRED_CONSENT_PURPOSES,
  DISCLOSURE_VERSION,
} from './disclosure';

const V = DISCLOSURE_VERSION;
const OLD = 'some-earlier-version';

const grant = (
  purpose: ActiveConsent['purpose'],
  disclosureVersion = V,
): ActiveConsent => ({ purpose, disclosureVersion });

describe('consent decision', () => {
  describe('the purpose set', () => {
    it('mirrors the shape the gate and schema assume', () => {
      // A guard against silent drift: the database check constraint and this
      // set must move together, so a change here is a deliberate migration.
      expect([...CONSENT_PURPOSES]).toEqual([
        'ai_coaching',
        'health_data',
        'product_improvement',
      ]);
      // product_improvement is optional on purpose — consent must be unbundled
      // and freely given, not a condition of using the Coach.
      expect([...REQUIRED_CONSENT_PURPOSES]).toEqual(['ai_coaching', 'health_data']);
    });
  });

  describe('isConsented', () => {
    it('is true for a purpose granted under the current version', () => {
      expect(isConsented([grant('ai_coaching')], 'ai_coaching')).toBe(true);
    });

    it('is false for a purpose with no grant', () => {
      expect(isConsented([grant('ai_coaching')], 'health_data')).toBe(false);
    });

    it('is false for a grant made under an older disclosure version', () => {
      // The wording changed; a stale grant does not carry forward.
      expect(isConsented([grant('ai_coaching', OLD)], 'ai_coaching')).toBe(false);
    });

    it('is false on an empty consent list', () => {
      expect(isConsented([], 'ai_coaching')).toBe(false);
    });
  });

  describe('missingRequiredConsents', () => {
    it('lists every required purpose when nothing is granted', () => {
      expect(missingRequiredConsents([])).toEqual(['ai_coaching', 'health_data']);
    });

    it('is empty once both required purposes are granted', () => {
      expect(
        missingRequiredConsents([grant('ai_coaching'), grant('health_data')]),
      ).toEqual([]);
    });

    it('still lists a required purpose whose only grant is stale', () => {
      expect(
        missingRequiredConsents([grant('ai_coaching'), grant('health_data', OLD)]),
      ).toEqual(['health_data']);
    });

    it('ignores the optional purpose entirely', () => {
      // Granting only the optional purpose opens nothing.
      expect(missingRequiredConsents([grant('product_improvement')])).toEqual([
        'ai_coaching',
        'health_data',
      ]);
    });

    it('opens the gate regardless of the optional purpose state', () => {
      expect(
        missingRequiredConsents([grant('ai_coaching'), grant('health_data')]),
      ).toEqual([]);
    });
  });

  describe('currentlyConsentedPurposes', () => {
    it('returns only current-version grants', () => {
      const active = [
        grant('ai_coaching'),
        grant('health_data', OLD),
        grant('product_improvement'),
      ];
      expect(currentlyConsentedPurposes(active).sort()).toEqual(
        ['ai_coaching', 'product_improvement'].sort(),
      );
    });

    it('is empty when every grant is stale', () => {
      expect(currentlyConsentedPurposes([grant('ai_coaching', OLD)])).toEqual([]);
    });
  });
});
