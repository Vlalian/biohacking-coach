import { describe, it, expect } from 'vitest';
import { routing } from '@/i18n/routing';
import en from './en.json';
import da from './da.json';

/**
 * Locale catalogues drift silently: someone adds a string to en.json, ships,
 * and Danish athletes get a raw message key in the UI. Nothing else catches
 * that — the app compiles and the page renders. So it is a test.
 */

function keyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];

  return Object.entries(obj).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key),
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
    const reference = keyPaths(en).sort();

    for (const locale of routing.locales) {
      expect(keyPaths(catalogues[locale]).sort(), `locale "${locale}" has drifted`).toEqual(
        reference,
      );
    }
  });

  it('leaves no string untranslated by copy-paste', () => {
    // A Danish value identical to its English one is usually a forgotten
    // translation. Technical sports terms (RPE, FTP, CSS, Zone 2, Ironman)
    // are the legitimate exception — they stay English in every language, per
    // the Athlete Language effort — so this asserts on whole strings only.
    const technicalTerms = /^(RPE|FTP|CSS|Zone \d|Ironman)$/;

    const flatten = (obj: unknown, prefix = ''): Array<[string, string]> =>
      typeof obj === 'string'
        ? [[prefix, obj]]
        : Object.entries(obj as object).flatMap(([k, v]) =>
            flatten(v, prefix ? `${prefix}.${k}` : k),
          );

    const enStrings = new Map(flatten(en));

    for (const [path, daValue] of flatten(da)) {
      if (technicalTerms.test(daValue)) continue;
      expect(daValue, `"${path}" is identical in Danish and English`).not.toBe(
        enStrings.get(path),
      );
    }
  });
});
