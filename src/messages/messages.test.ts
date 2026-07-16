import { describe, it, expect } from 'vitest';
import { routing } from '@/i18n/routing';
import en from './en.json';
import da from './da.json';

/**
 * Locale catalogues drift silently: someone adds a string to en.json, ships,
 * and Danish athletes get a raw message key in the UI. Nothing else catches
 * that — the app compiles and the page renders. So it is a test.
 */

/** Walks a catalogue into [dotted.path, string] pairs. */
function entries(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];

  return Object.entries(value as object).flatMap(([key, child]) =>
    entries(child, path ? `${path}.${key}` : key),
  );
}

const catalogues: Record<string, unknown> = { en, da };

describe('message catalogues', () => {
  it('has a catalogue for every configured locale', () => {
    for (const locale of routing.locales) {
      expect(catalogues[locale], `no catalogue for locale "${locale}"`).toBeDefined();
    }
  });

  it('every locale defines exactly the same keys', () => {
    const reference = entries(en)
      .map(([path]) => path)
      .sort();

    for (const locale of routing.locales) {
      const paths = entries(catalogues[locale])
        .map(([path]) => path)
        .sort();

      expect(paths, `locale "${locale}" has drifted`).toEqual(reference);
    }
  });

  it('leaves no string untranslated by copy-paste', () => {
    // A Danish value identical to its English one is usually a forgotten
    // translation. Technical sports terms (RPE, FTP, CSS, Zone 2, Ironman)
    // are the legitimate exception — they stay English in every language, per
    // the Athlete Language effort — and they appear *inside* sentences, so
    // this matches anywhere in the string rather than anchoring the whole of
    // it: "Zone 2 pace" is identical in both languages on purpose.
    const technicalTerm = /\b(RPE|FTP|CSS|Zone \d|Ironman)\b/;

    const english = new Map(entries(en));

    for (const [path, danish] of entries(da)) {
      if (technicalTerm.test(danish)) continue;

      expect(danish, `"${path}" is identical in Danish and English`).not.toBe(
        english.get(path),
      );
    }
  });
});
