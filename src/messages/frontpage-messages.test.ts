import { describe, it, expect } from 'vitest';
import en from './en.json';
import da from './da.json';

/**
 * showable-version/62: the Frontpage's copy is Lovable's, with Mads's
 * 2026-10-31 changes (no "anonymised" research claim, "Privacy policy") and
 * the app's own View names taken from the Shell catalogue.
 */
describe('Frontpage catalogue', () => {
  it('holds the same Frontpage keys in en and da, with the 2026-10-31 copy', () => {
    expect(Object.keys(da.Frontpage).sort()).toEqual(Object.keys(en.Frontpage).sort());
    expect(en.Frontpage.researchTitle).toBe('No name or email in research questions');
    expect(da.Frontpage.researchTitle).toBe('Intet navn eller e-mail i forskningsspørgsmål');
    expect(en.Frontpage.researchBody).toBe('Library questions carry your training phase and question, never who you are.');
    expect(da.Frontpage.researchBody).toBe('Spørgsmål til biblioteket indeholder din træningsfase og dit spørgsmål, aldrig hvem du er.');
    expect(en.Frontpage.euBody).toBe('Stored in Frankfurt. AI runs in the US, with no name or email sent.');
    expect(en.Frontpage.privacy).toBe('Privacy policy');
    expect(da.Frontpage.privacy).toBe('Privatlivspolitik');
    expect(en.Frontpage.coachChat).toBe('Ask Momentum');
    expect(da.Frontpage.coachChat).toBe('Spørg Momentum');
  });

  it('leaves the View names to the Shell catalogue', () => {
    for (const key of ['roster', 'plan', 'information']) {
      expect(Object.keys(en.Frontpage)).not.toContain(key);
      expect(Object.keys(da.Frontpage)).not.toContain(key);
    }
    expect(en.Frontpage.overviewBody).toContain('{trainingPlan}');
    expect(da.Frontpage.overviewBody).toContain('{trainingPlan}');
  });
});
