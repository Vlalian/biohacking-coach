import { describe, it, expect } from 'vitest';
import en from './en.json';
import da from './da.json';

/** showable-version/63: each of the Frontpage's four pictures has its own alt text, per language. */
const keys = ['altRosterView', 'altCoachChat', 'altTrainingPlan', 'altInformationView'] as const;

describe('Frontpage picture alt texts', () => {
  it('holds the same four non-empty alt keys in en and da, written per language', () => {
    const enFront = en.Frontpage as Record<string, string>;
    const daFront = da.Frontpage as Record<string, string>;
    for (const key of keys) {
      expect(enFront[key].length).toBeGreaterThan(10);
      expect(daFront[key].length).toBeGreaterThan(10);
      expect(daFront[key]).not.toBe(enFront[key]);
    }
    expect(Object.keys(da.Frontpage).sort()).toEqual(Object.keys(en.Frontpage).sort());
  });
});
