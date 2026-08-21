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
    // HRV and Pace joined with slice 09's onboarding options — both are in the
    // Coach's stay-English SPORTS_TERMS list, and the POC's Danish catalogue
    // kept them verbatim too. The Information View (slice 10) added the panel
    // vocabulary: TSS, Fitness/Fatigue/Form, Peak Power, units.
    // "Coach" joins the list here rather than the cognates exemption below: it
    // isn't a coincidental Danish/English spelling match, it's the domain term
    // (CONTEXT.md) used untranslated throughout the existing Danish catalogue
    // — "Coach tænker…", "Din Coach er klar, når du er.".
    // "Coaching Channel" and "AI Coach" (slice 17) are the same case, per word:
    // CONTEXT.md names the Channel as the coined product term for the shared
    // athlete/Head Coach/AI thread (avoiding "chat/DM/thread"), and inside it
    // names the AI party "AI Coach" specifically to distinguish it from the
    // Head Coach — both fixed names, not translated phrases.
    const technicalTerms =
      /\b(RPE|FTP|CSS|Zone|Z\d|Ironman|HRV|Pace|TSS|Fitness|Fatigue|Form|Peak Power|kJ|bpm|W|Coach|Coaching Channel|AI Coach)\b/g;
    // Danish cognates — words whose correct Danish spelling IS the English one
    // — are exempt only inside the Information View's catalogue, so the guard
    // keeps its full strength everywhere else.
    const cognates =
      /\b(Information|Session|Sport|Type|Distance|Motivation|System|min|Plan|Data|Briefing)\b/g;
    const cognateScope = (path: string) =>
      path.startsWith('Information.') ||
      path.startsWith('SessionDrawer.') ||
      path === 'Calendar.minutes' ||
      path === 'AthletePage.informationLink' ||
      path === 'Shell.viewInformation' ||
      // The theme-cycle's "System" option (follow the OS) — genuinely spelled
      // the same in Danish, confirmed by the existing lowercase "system" in
      // ThemeToggle.switch.
      path === 'Shell.themeSystem' ||
      // "Session Type" is the domain term (CONTEXT.md) — the calendar legend
      // names it verbatim in both languages, like Information's "Type" already does.
      path === 'Calendar.legend' ||
      // The Head Coach's three athlete tabs. "Plan", "Data" and "Briefing" are
      // each spelled identically in Danish — plan and data are ordinary Danish
      // words, and briefing is the loanword this catalogue already uses in
      // lowercase ("Åbn briefing", "Coach-briefing"). A one-word tab label has
      // nowhere to hide a forgotten translation, which is what the guard is for.
      path.startsWith('Roster.tab');
    // Simple ICU placeholders are not words — "• {clause}" is structure, and is
    // identical in every language by definition. Deliberately narrow twice
    // over. First in shape: `\w+` inside the braces, so plural forms like
    // "{count, plural, one {# session} other {# sessions}}" keep their real
    // words and stay under the guard. Second in *scope*: exempting them
    // catalogue-wide would wave through any message whose only non-placeholder
    // content is punctuation, so this is scoped by path like the cognates
    // above, and only Narration's wrappers need it.
    const placeholders = /\{\s*\w+\s*\}/g;
    const placeholderScope = (path: string) => path.startsWith('Narration.');
    // Strip punctuation left behind by removed terms ("Peak Power (W)" → "()"),
    // so a message that was nothing but terms compares as empty.
    const translatable = (message: string, path: string) =>
      message
        .replace(placeholderScope(path) ? placeholders : /$^/g, '')
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
