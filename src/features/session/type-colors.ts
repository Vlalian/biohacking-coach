/**
 * Session Type → display colour, carried over from the POC's SESSION_COLORS.
 *
 * One palette, shared by every surface that colours a session by its type
 * (calendar dots, Information View comparison columns). The names are the
 * training vocabulary and stay as-is; only the values live here.
 */
export const TYPE_COLORS: Record<string, string> = {
  Endurance: '#4a90d9',
  Intensity: '#e05555',
  Tempo: '#c9a96e',
  Recovery: '#6db36d',
  Rest: '#8a8a8a',
  Strength: '#9b6dd6',
  Mobility: '#4db6ac',
  Other: '#9e9e9e',
};

export const DEFAULT_TYPE_COLOR = '#8a8a8a';

/** The plannable Session Types the comparison picker filters on. */
export const FILTERABLE_TYPES = ['Endurance', 'Intensity', 'Tempo', 'Recovery'];
