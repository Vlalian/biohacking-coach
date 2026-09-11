import { describe, it, expect } from 'vitest';
import {
  isConsented,
  missingRequiredConsents,
  currentlyConsentedPurposes,
  type ActiveConsent,
} from './consent';
import {
  CONSENT_PURPOSES,
  POINT_OF_USE_PURPOSES,
  REQUIRED_CONSENT_PURPOSES,
  DISCLOSURE_VERSION,
  purposesToShow,
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
        'injury_health_data',
        'head_coach_visibility',
        'product_improvement',
      ]);
      // Only two are required. The other three are optional on purpose — consent
      // must be unbundled and freely given, not a condition of using the Coach.
      expect([...REQUIRED_CONSENT_PURPOSES]).toEqual(['ai_coaching', 'health_data']);
      // And the two added by `training-architecture/12` are asked at the moment
      // they first matter rather than on the consent screen: declaring an injury,
      // and accepting a Coaching Link.
      expect([...POINT_OF_USE_PURPOSES]).toEqual([
        'injury_health_data',
        'head_coach_visibility',
      ]);
      // No purpose is both required and asked later — that would be a gate the
      // athlete cannot pass at the moment it is checked.
      for (const purpose of POINT_OF_USE_PURPOSES) {
        expect(REQUIRED_CONSENT_PURPOSES).not.toContain(purpose);
      }
    });
  });

  describe('which purposes a screen shows', () => {
    // CodeRabbit on PR #60: the manage screen was mapping the onboarding list,
    // so a point-of-use grant, once made, had nowhere to be withdrawn from.
    // Withdrawal has to be as easy as granting (Art. 7(3)), and the athlete
    // must not need to find an injury form to take back a consent about one.
    it('shows the gate only the onboarding purposes', () => {
      expect(purposesToShow('gate', ['injury_health_data'])).toEqual([
        'ai_coaching',
        'health_data',
        'product_improvement',
      ]);
    });

    it('shows the manage screen a point-of-use purpose once it is granted', () => {
      expect(purposesToShow('manage', ['ai_coaching', 'head_coach_visibility'])).toEqual([
        'ai_coaching',
        'health_data',
        'head_coach_visibility',
        'product_improvement',
      ]);
    });

    it('does not offer an ungranted point-of-use purpose on the manage screen', () => {
      // Granting one there would be a third asking surface, with no injury and
      // no named coach in front of the athlete — the noise ADR 0012 rejected.
      expect(purposesToShow('manage', ['ai_coaching', 'health_data'])).toEqual([
        'ai_coaching',
        'health_data',
        'product_improvement',
      ]);
    });

    it('keeps the disclosure order, whatever order the grants arrive in', () => {
      expect(purposesToShow('manage', ['head_coach_visibility', 'injury_health_data'])).toEqual([
        'ai_coaching',
        'health_data',
        'injury_health_data',
        'head_coach_visibility',
        'product_improvement',
      ]);
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
