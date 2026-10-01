import da from '@/messages/da.json';
import en from '@/messages/en.json';
import type { SportSwap } from './weekly-session';

/**
 * The explained sport swaps as the athlete reads them (`training-architecture/26`,
 * Mads's ruling of 2026-09-30): one line per swap, "Onsdag: løb → cykel (knæ)",
 * in the Athlete Language. The weekday and the sports come from the message
 * catalogues; the reason stays as Momentum wrote it.
 *
 * Its own module, and imported by the draft service only, because it carries
 * both catalogues: `weekly-session.ts` is imported by the Head Coach's review
 * in the browser, which has no use for them.
 */

const CATALOGUES = { en, da };

/**
 * The catalogue's weekday names in `getUTCDay` order. The Settings picker's,
 * capitalised in both languages: a swap line starts a sentence.
 */
const DAY_KEYS = ['daySunday', 'dayMonday', 'dayTuesday', 'dayWednesday', 'dayThursday', 'dayFriday', 'daySaturday'] as const;

/** Momentum's sentence on what changed, with the explained sport swaps after it, in the athlete's language. */
export function withSwaps(whatChanged: string | null, swaps: SportSwap[], language: string | null): string | null {
  if (swaps.length === 0) return whatChanged;
  const words = CATALOGUES[language === 'da' ? 'da' : 'en'];
  const sport = words.HowTo.sports;
  const lines = swaps
    .map((swap) => `${words.Settings[DAY_KEYS[weekdayOf(swap.date)]]}: ${sport[swap.from]} → ${sport[swap.to]} (${swap.reason})`)
    .join('; ');
  return whatChanged ? `${whatChanged} ${lines}` : lines;
}

/** A date key's weekday, read in UTC: a date key is a calendar day, not an instant (`formatFullDate`). */
function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}
