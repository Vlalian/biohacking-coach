import { describe, it, expect } from 'vitest';
import {
  CONSENT_PURPOSES,
  DISCLOSURE_VERSION,
  disclosureCopy,
  isConsentPurpose,
} from './disclosure';

/**
 * The consent disclosure is a legal artifact, and until now the function that
 * chooses which language of it an athlete sees had no test at all — the `/onkel`
 * gate found it while grading the 2026-09-01 processor amendment. Every mutant
 * in `disclosureCopy` survived, which means the ternary could have been flipped
 * and a Danish athlete shown English consent copy with nothing to catch it.
 *
 * These are deliberately not snapshot tests. Pinning the exact wording would
 * make every future amendment a snapshot update, which trains people to accept
 * the diff without reading it — the opposite of what a versioned legal artifact
 * needs. They pin the *properties* that must hold whatever the wording becomes.
 */

describe('disclosureCopy', () => {
  it('returns the Danish copy for the Danish Athlete Language', () => {
    expect(disclosureCopy('da').heading).toBe('Før vi starter: dine data');
  });

  it('returns the English copy for English', () => {
    expect(disclosureCopy('en').heading).toBe('Before we start: your data');
  });

  it('falls back to English for an unknown Athlete Language', () => {
    // Default stated in CONTEXT.md → Athlete Language. An unrecognised locale
    // must still render a complete disclosure; a blank consent screen would gate
    // the athlete out of the product entirely.
    expect(disclosureCopy('de').heading).toBe('Before we start: your data');
    expect(disclosureCopy('').heading).toBe('Before we start: your data');
  });

  it('carries copy for every consent purpose, in both languages', () => {
    for (const locale of ['en', 'da']) {
      const copy = disclosureCopy(locale);
      for (const purpose of CONSENT_PURPOSES) {
        expect(copy.purposes[purpose].title.length).toBeGreaterThan(0);
        expect(copy.purposes[purpose].body.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('the processors the disclosure names', () => {
  /**
   * Added with the 2026-09-01 amendment. The Knowledge Oracle sends a query
   * built from the athlete's training state to OpenAI to be embedded, so OpenAI
   * is a processor and the disclosure has to say so — `embedder.ts` flagged this
   * and deferred it here.
   *
   * This guards the honesty of the artifact in both languages at once, which is
   * the failure mode that actually happens: someone updates the English copy for
   * a new vendor and the Danish athlete is told something untrue.
   */
  it.each(['en', 'da'])('names both Anthropic and OpenAI in %s', (locale) => {
    const { controller } = disclosureCopy(locale);
    expect(controller).toContain('Anthropic');
    expect(controller).toContain('OpenAI');
  });

  it.each(['en', 'da'])(
    'still promises name and email reach neither, in %s',
    (locale) => {
      const copy = disclosureCopy(locale);
      const claim = locale === 'da' ? 'Dit navn og din e-mail' : 'Your name and email';
      expect(copy.controller).toContain(claim);
    },
  );
});

describe('DISCLOSURE_VERSION', () => {
  it('is a date, so a reader can tell which wording they consented to', () => {
    expect(DISCLOSURE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isConsentPurpose', () => {
  it('accepts every known purpose', () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(isConsentPurpose(purpose)).toBe(true);
    }
  });

  it('rejects a string that is not a purpose', () => {
    expect(isConsentPurpose('marketing')).toBe(false);
  });
});
