import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DISCLOSURE_VERSION } from './disclosure';
import type { ActiveConsent } from './consent';

// The gate reads the athlete's active consents through the repository and
// applies the pure decision. Mock the read so the gate's own wiring — refuse vs
// open, and which purposes it reports missing — is what is under test.
const getActiveConsents = vi.fn<() => Promise<ActiveConsent[]>>();
vi.mock('./consent-repository', () => ({ getActiveConsents }));

const { assertAiCoachingConsent } = await import('./consent-gate');

const grant = (
  purpose: ActiveConsent['purpose'],
  disclosureVersion = DISCLOSURE_VERSION,
): ActiveConsent => ({ purpose, disclosureVersion });

describe('assertAiCoachingConsent', () => {
  beforeEach(() => getActiveConsents.mockReset());

  it('opens when both required purposes are granted at the current version', async () => {
    getActiveConsents.mockResolvedValue([grant('ai_coaching'), grant('health_data')]);

    await expect(assertAiCoachingConsent('athlete_1')).resolves.toEqual({ ok: true });
  });

  it('refuses with the missing purposes when nothing is granted', async () => {
    getActiveConsents.mockResolvedValue([]);

    await expect(assertAiCoachingConsent('athlete_1')).resolves.toEqual({
      ok: false,
      missing: ['ai_coaching', 'health_data'],
    });
  });

  it('refuses when a required grant is only present at a stale version', async () => {
    getActiveConsents.mockResolvedValue([
      grant('ai_coaching'),
      grant('health_data', 'old-version'),
    ]);

    await expect(assertAiCoachingConsent('athlete_1')).resolves.toEqual({
      ok: false,
      missing: ['health_data'],
    });
  });

  it('opens on the required purposes regardless of the optional one', async () => {
    getActiveConsents.mockResolvedValue([grant('ai_coaching'), grant('health_data')]);

    const withoutOptional = await assertAiCoachingConsent('athlete_1');
    expect(withoutOptional).toEqual({ ok: true });
  });

  it('reads the consents for the athlete it was asked about', async () => {
    getActiveConsents.mockResolvedValue([]);

    await assertAiCoachingConsent('athlete_42');

    expect(getActiveConsents).toHaveBeenCalledWith('athlete_42');
  });
});
