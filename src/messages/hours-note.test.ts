import { describe, expect, it } from 'vitest';
import { HOURS_PER_WEEK_MAX, HOURS_PER_WEEK_MIN } from '@/features/onboarding/onboarding-flow';
import da from './da.json';
import en from './en.json';

const fill = (text: string) => text.replace('{max}', String(HOURS_PER_WEEK_MAX));

describe('Settings hoursNote', () => {
  it('reads "1 to <max>" in English once the bound is filled in', () => {
    expect(HOURS_PER_WEEK_MIN).toBe(1);
    expect(fill(en.Settings.hoursNote)).toMatch(new RegExp(`Whole hours, ${HOURS_PER_WEEK_MIN} to ${HOURS_PER_WEEK_MAX}\\.$`));
  });

  it('reads "1 til <max>" in Danish once the bound is filled in', () => {
    expect(fill(da.Settings.hoursNote)).toMatch(new RegExp(`Hele timer, ${HOURS_PER_WEEK_MIN} til ${HOURS_PER_WEEK_MAX}\\.$`));
  });

  it('names the placeholder exactly once in each language', () => {
    for (const messages of [en, da]) {
      expect(messages.Settings.hoursNote.split('{max}')).toHaveLength(2);
    }
  });
});
