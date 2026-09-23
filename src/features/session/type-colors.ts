/**
 * Session Type → display colour, carried over from the POC's SESSION_COLORS.
 *
 * One palette, shared by every surface that colours a session by its type
 * (calendar dots, Information View comparison columns). The names are the
 * training vocabulary and stay as-is; only the values live here.
 *
 * Every value holds 3 : 1 against both page backgrounds, the WCAG bar for a
 * non-text mark such as a chip stripe (`showable-version/38`); the darker
 * Tempo, Recovery, Mobility and Other replaced values that measured 2.1–2.6 on
 * the light page. `src/app/globals.test.ts` measures them.
 */
export const TYPE_COLORS: Record<string, string> = {
  Endurance: '#4a90d9',
  Intensity: '#e05555',
  Tempo: '#a8842f',
  Recovery: '#3f8f3f',
  Rest: '#8a8a8a',
  Strength: '#9b6dd6',
  Mobility: '#2e9a8f',
  Other: '#7a7a7a',
};

export const DEFAULT_TYPE_COLOR = '#7a7a7a';

/** The plannable Session Types the comparison picker filters on. */
export const FILTERABLE_TYPES = ['Endurance', 'Intensity', 'Tempo', 'Recovery'];

/**
 * The Session Types a Head Coach may prescribe: the plannable four, plus Rest
 * and Strength.
 *
 * One list, because the Head Coach reaches this choice from two places — the
 * `PrescribePanel` when adding a session, and the Session Drawer when editing
 * one — and a coach offered a type in one surface that the other does not know
 * is a bug that only ever shows up as a confused user. It was written out
 * separately in both until 2026-09-08.
 */
export const PRESCRIBABLE_TYPES = [...FILTERABLE_TYPES, 'Rest', 'Strength'];
