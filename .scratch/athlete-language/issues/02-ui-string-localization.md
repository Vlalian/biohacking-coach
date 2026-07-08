Status: done

# 02 — UI String Localization (Danish / English)

## Parent

`.scratch/athlete-language/PRD.md`

## What to build

Render all UI text in the athlete's stored language. Implement a minimal key-based string lookup — a `t(key)` function that returns the string for the current language. No i18n framework needed at POC scale.

Strings to localize include: button labels ("Save", "Mark as skipped", "Mark as unavailable", "Undo", "Discuss with Coach", "Rate this session"), modal titles, status badges, navigation labels, and any instructional text visible to the athlete.

Technical sports terms (RPE, FTP, Zone 2, etc.) stay in English in both language variants — they are not translated.

For the POC, two languages: `'da'` (Danish) and `'en'` (English, default).

## Acceptance criteria

- [ ] An athlete with `language: 'da'` sees all UI labels in Danish
- [ ] An athlete with `language: 'en'` sees all UI labels in English (unchanged behaviour)
- [ ] Technical training terms are not translated in either language
- [ ] Button labels, modal titles, status badges, and navigation labels are all covered
- [ ] Changing `bca_language` and refreshing applies the new language to all UI text

## Blocked by

`.scratch/mcq-onboarding/issues/01-mcq-flow-core-fields.md`
