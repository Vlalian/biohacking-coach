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
    // translation. Technical sports terms are the legitimate exception — they
    // stay English in every language, per the Athlete Language effort.
    //
    // Exempt the *terms*, not the messages that contain them: skipping any
    // string holding "Zone 2" would wave through "Welcome back, Zone 2"
    // untranslated. So strip the terms and compare what remains — a message
    // that is nothing but technical terms has no translatable text and is the
    // only thing legitimately identical in both languages.
    // The Information View widened the exempt vocabulary two ways (slice 10).
    // Technical terms that stay English in every Athlete Language grew by the
    // panel vocabulary: TSS, Fitness/Fatigue/Form, Peak Power, units.
    const technicalTerms =
      /\b(RPE|FTP|CSS|Zone \d|Z\d|Ironman|TSS|Fitness|Fatigue|Form|Peak Power|kJ|bpm|W)\b/g;
    // Danish cognates — words whose correct Danish spelling IS the English one
    // — are exempt only inside the Information View's catalogue, so the guard
    // keeps its full strength everywhere else.
    const cognates = /\b(Information|Session|Sport|Type|Distance|Motivation)\b/g;
    const cognateScope = (path: string) =>
      path.startsWith('Information.') || path === 'AthletePage.informationLink';
    // Strip punctuation left behind by removed terms ("Peak Power (W)" → "()"),
    // so a message that was nothing but terms compares as empty.
    const translatable = (message: string, path: string) =>
      message
        .replace(technicalTerms, '')
        .replace(cognateScope(path) ? cognates : /$^/g, '')
        .replace(/[^\p{L}]+/gu, ' ')
        .trim();

    const english = new Map(entries(en));

    for (const [path, danish] of entries(da)) {
      const danishText = translatable(danish, path);
      if (danishText === '') continue;

      expect(danishText, `"${path}" is identical in Danish and English`).not.toBe(
        translatable(english.get(path) ?? '', path),
      );
    }
  });
});
