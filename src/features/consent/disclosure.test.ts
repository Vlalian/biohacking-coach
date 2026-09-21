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

  /**
   * `preferred-name/01` (2026-09-18). The controller sentence used to promise
   * "Your name and email are never sent to either" — true of the account name
   * as a *field* (ADR 0006 keeps it out of every training table), false of free
   * text: `assertNoDirectIdentifier` recognises email and phone shapes only, so
   * a name an athlete types into a session note reaches the model. A consent
   * artifact cannot make a promise the code does not keep, so the claim is
   * narrowed to the account name and email, and the athlete is told plainly
   * that what they type themselves is sent as written.
   */
  it.each(['en', 'da'])('no longer claims a name can never reach the AI, in %s', (locale) => {
    const { controller } = disclosureCopy(locale);
    expect(controller).not.toContain('Your name and email are never');
    expect(controller).not.toContain('Dit navn og din e-mail sendes aldrig');
  });

  it.each(['en', 'da'])('narrows the promise to the account name and email, in %s', (locale) => {
    const { controller } = disclosureCopy(locale);
    expect(controller).toContain(locale === 'da' ? 'kontonavn' : 'account name');
  });

  // preferred-name/02, in the same bump: the one name that IS sent is the one
  // the athlete chose for the Coach, and the disclosure says so.
  it.each(['en', 'da'])('names the Preferred Name as the one name that is sent, in %s', (locale) => {
    const { controller } = disclosureCopy(locale);
    expect(controller).toContain(
      locale === 'da' ? 'det navn, du selv vælger' : 'the name you choose for the Coach to call you',
    );
  });

  it.each(['en', 'da'])(
    'tells the athlete what they type themselves is sent as written, in %s',
    (locale) => {
      const { controller } = disclosureCopy(locale);
      expect(controller).toContain(
        locale === 'da' ? 'Det, du selv skriver' : 'Anything you type yourself',
      );
    },
  );
});

describe('DISCLOSURE_VERSION', () => {
  it('is a date, so a reader can tell which wording they consented to', () => {
    expect(DISCLOSURE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // A wording change and a version bump are the same edit (the module's own
  // rule). The identity sentence changed on 2026-09-18, so the version must be
  // past the one the old wording carried. Not the literal — pinning that would
  // make every future amendment a test edit nobody reads.
  it('was bumped past the version that carried the old identity claim', () => {
    expect(DISCLOSURE_VERSION > '2026-09-10').toBe(true);
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
