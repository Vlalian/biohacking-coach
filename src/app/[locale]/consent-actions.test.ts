import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveAthleteId, grantConsent, withdrawConsent, revalidatePath } = vi.hoisted(
  () => ({
    resolveAthleteId: vi.fn(),
    grantConsent: vi.fn(),
    withdrawConsent: vi.fn(),
    revalidatePath: vi.fn(),
  }),
);

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/consent/consent-repository', () => ({ grantConsent, withdrawConsent }));

const { grantConsentsAction, withdrawConsentAction } = await import('./consent-actions');

/**
 * Consent is the lawful basis for processing health-adjacent data (GDPR
 * decision A), so what gets recorded has to be exactly what was agreed to. The
 * purpose vocabulary is closed, and an unrecognised purpose refuses the whole
 * call rather than silently granting the subset it happened to understand.
 */
const ATHLETE = 'athlete_1';
const REAL = 'ai_coaching';

beforeEach(() => {
  resolveAthleteId.mockReset();
  grantConsent.mockReset();
  withdrawConsent.mockReset();
  revalidatePath.mockClear();
});

describe('grantConsentsAction', () => {
  it('records each granted purpose for the signed-in athlete', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);

    const result = await grantConsentsAction([REAL, 'health_data']);

    expect(result).toEqual({ ok: true });
    expect(grantConsent).toHaveBeenCalledWith(ATHLETE, REAL);
    expect(grantConsent).toHaveBeenCalledWith(ATHLETE, 'health_data');
  });

  it('grants a repeated purpose once', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);

    await grantConsentsAction([REAL, REAL, REAL]);

    expect(grantConsent).toHaveBeenCalledTimes(1);
  });

  it('refuses the whole call on any unrecognised purpose, granting nothing', async () => {
    // The half that matters is "granting nothing": a partial grant would leave
    // a consent record that does not match what the athlete was shown.
    const result = await grantConsentsAction([REAL, 'sell_to_advertisers']);

    expect(result).toEqual({ ok: false, reason: 'invalid-purpose' });
    expect(resolveAthleteId).not.toHaveBeenCalled();
    expect(grantConsent).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await grantConsentsAction([REAL]);

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(grantConsent).not.toHaveBeenCalled();
  });
});

describe('withdrawConsentAction', () => {
  it('withdraws one purpose for the signed-in athlete', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);

    const result = await withdrawConsentAction(REAL);

    expect(result).toEqual({ ok: true });
    expect(withdrawConsent).toHaveBeenCalledWith(ATHLETE, REAL);
  });

  it('refuses an unrecognised purpose', async () => {
    const result = await withdrawConsentAction('not_a_purpose');

    expect(result).toEqual({ ok: false, reason: 'invalid-purpose' });
    expect(withdrawConsent).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await withdrawConsentAction(REAL);

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(withdrawConsent).not.toHaveBeenCalled();
  });
});
