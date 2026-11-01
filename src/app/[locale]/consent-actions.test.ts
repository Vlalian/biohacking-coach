import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveAthleteId, grantConsent, withdrawConsent, revalidatePath, pauseLinkForAthlete, resumeLinkForAthlete } = vi.hoisted(
  () => ({
    pauseLinkForAthlete: vi.fn(),
    resumeLinkForAthlete: vi.fn(),
    resolveAthleteId: vi.fn(),
    grantConsent: vi.fn(),
    withdrawConsent: vi.fn(),
    revalidatePath: vi.fn(),
  }),
);

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/consent/consent-repository', () => ({ grantConsent, withdrawConsent }));
vi.mock('@/features/coach/coach-repository', () => ({ pauseLinkForAthlete, resumeLinkForAthlete }));

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
  pauseLinkForAthlete.mockReset();
  resumeLinkForAthlete.mockReset();
});

describe('the Head-Coach-visibility consent and the link (training-architecture/14)', () => {
  it('withdrawing it pauses the link; granting it again resumes it', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);

    await withdrawConsentAction('head_coach_visibility');
    expect(pauseLinkForAthlete).toHaveBeenCalledWith(ATHLETE);
    // Pause first: if the withdrawal then fails, the coach already sees nothing
    // and the athlete can retry it (CodeRabbit, PR #130).
    expect(pauseLinkForAthlete.mock.invocationCallOrder[0]).toBeLessThan(withdrawConsent.mock.invocationCallOrder[0]);

    await grantConsentsAction(['head_coach_visibility']);
    expect(resumeLinkForAthlete).toHaveBeenCalledWith(ATHLETE);
  });

  it('a withdrawal that fails after the pause leaves the link paused, not active', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    withdrawConsent.mockRejectedValue(new Error('db down'));

    await expect(withdrawConsentAction('head_coach_visibility')).rejects.toThrow('db down');
    expect(pauseLinkForAthlete).toHaveBeenCalledWith(ATHLETE);
  });

  it('any other consent leaves the link alone', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);

    await withdrawConsentAction('product_improvement');
    await grantConsentsAction([REAL, 'health_data']);

    expect(pauseLinkForAthlete).not.toHaveBeenCalled();
    expect(resumeLinkForAthlete).not.toHaveBeenCalled();
  });
});

describe('grantConsentsAction', () => {
  it('records each granted purpose for the signed-in athlete', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);

    const result = await grantConsentsAction([REAL, 'health_data']);

    expect(result).toEqual({ ok: true });
    expect(grantConsent).toHaveBeenCalledWith(ATHLETE, REAL);
    expect(grantConsent).toHaveBeenCalledWith(ATHLETE, 'health_data');
    // The gate lives in the layout: granting the last required purpose has to
    // lift it on the next render, so it is the layout that is refreshed.
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
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
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await grantConsentsAction([REAL]);

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(grantConsent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('withdrawConsentAction', () => {
  it('withdraws one purpose for the signed-in athlete', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);

    const result = await withdrawConsentAction(REAL);

    expect(result).toEqual({ ok: true });
    expect(withdrawConsent).toHaveBeenCalledWith(ATHLETE, REAL);
    // Withdrawing a required purpose drops the gate back into place.
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('refuses an unrecognised purpose', async () => {
    const result = await withdrawConsentAction('not_a_purpose');

    expect(result).toEqual({ ok: false, reason: 'invalid-purpose' });
    expect(withdrawConsent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await withdrawConsentAction(REAL);

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(withdrawConsent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
