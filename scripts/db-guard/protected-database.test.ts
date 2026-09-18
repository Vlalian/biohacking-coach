import { describe, expect, it, vi } from 'vitest';
import { PRODUCTION_ENDPOINT, guardDatabase, protectedDatabaseVerdict } from './protected-database';

/**
 * The production database is the one place a script must never write by
 * accident. `.env.local` pointed at it for weeks (found 2026-09-18): every
 * `npm run seed` and every page-suite run before frontend-quality/07 wrote
 * there. This is the check every writing script runs first.
 */
describe('protectedDatabaseVerdict', () => {
  const prod = `postgresql://u:p@${PRODUCTION_ENDPOINT}.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require`;
  const dev = 'postgresql://u:p@ep-round-cloud-a1b2c3d4.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require';

  it('refuses the production endpoint without the flag, naming the escape hatch', () => {
    const v = protectedDatabaseVerdict(prod, []);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain(PRODUCTION_ENDPOINT);
    expect(v.reason).toContain('--production');
    expect(v.reason).toContain('neon connection-string dev/<name>');
  });

  it('allows the production endpoint only with --production', () => {
    expect(protectedDatabaseVerdict(prod, ['--production']).ok).toBe(true);
  });

  it('allows any other endpoint without a flag', () => {
    expect(protectedDatabaseVerdict(dev, []).ok).toBe(true);
  });

  it('refuses an unset or empty URL, since the driver would fail later with a worse message', () => {
    expect(protectedDatabaseVerdict(undefined, [])).toEqual({
      ok: false,
      reason: 'DATABASE_URL is not set; nothing to run against.',
    });
    expect(protectedDatabaseVerdict('', []).ok).toBe(false);
  });

  it('matches the endpoint anywhere in the host, not by whole-string equality', () => {
    const pooled = `postgresql://u:p@${PRODUCTION_ENDPOINT}-pooler.c-4.eu-central-1.aws.neon.tech/neondb`;
    expect(protectedDatabaseVerdict(pooled, []).ok).toBe(false);
  });
});

describe('guardDatabase', () => {
  it('exits with code 1 and prints the reason when refused', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    guardDatabase(`postgresql://u:p@${PRODUCTION_ENDPOINT}.neon.tech/db`, []);
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Refusing to write'));
    exit.mockRestore();
    error.mockRestore();
  });

  it('returns quietly when allowed', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    guardDatabase('postgresql://u:p@ep-other.neon.tech/db', []);
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});
