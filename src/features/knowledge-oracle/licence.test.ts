import { describe, it, expect } from 'vitest';
import { isAdmissible } from './licence';

describe('isAdmissible', () => {
  it('accepts CC0 and CC BY, versioned or not', () => {
    // Unversioned CC BY is row 8 of the register (Frontiers), where the version
    // is not stated on the article page or the journal policy.
    for (const licence of ['CC0', 'CC0 1.0', 'CC BY 4.0', 'CC BY', 'cc by 4.0']) {
      expect(isAdmissible(licence), licence).toBe(true);
    }
  });

  it('rejects NC, ND, SA, and anything it does not recognise', () => {
    // The last two are the ones that matter most: an empty string and an
    // unrecognised licence must fail closed, because the whole point of the
    // register is that "no licence statement found" is not "probably fine".
    for (const licence of [
      'CC BY-NC 4.0',
      'CC BY-ND',
      'CC BY-SA 4.0',
      'CC BY-NC-ND 4.0',
      '',
      'all rights reserved',
    ]) {
      expect(isAdmissible(licence), licence).toBe(false);
    }
  });

  it('rejects a version Creative Commons never published', () => {
    // `\d+(\.\d+)?` reads as a tighter rule than "any version" and is not one.
    // CC BY exists at 1.0, 2.0, 2.5, 3.0 and 4.0; CC0 only at 1.0. A licence
    // string naming any other version is either a typo or something invented,
    // and both are exactly what a fail-closed whitelist is for.
    for (const licence of [
      'CC0 2.0',
      'CC0 4.0',
      'CC BY 99.0',
      'CC BY 7.3',
      'CC BY 5.0',
      'CC BY 0.1',
    ]) {
      expect(isAdmissible(licence), licence).toBe(false);
    }
  });

  it('rejects a recognised grant carrying an unrecognised qualification', () => {
    // A licence that starts well and then takes something back. Both spellings
    // of the bare grant must fail this the same way: for a while CC0 did not,
    // because its branch was anchored only at the front, so "CC0 " matched as a
    // prefix and everything after it went unread.
    for (const licence of [
      'CC0 except figures',
      'CC BY except figures',
      'CC BY 4.0 except figures',
      'CC0 1.0 with reservations',
      'CC BY, non-commercial use only',
    ]) {
      expect(isAdmissible(licence), licence).toBe(false);
    }
  });
});
