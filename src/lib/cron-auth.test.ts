import { describe, it, expect } from 'vitest';
import { isCronRequest } from './cron-auth';

/** Vercel Cron calls with `Authorization: Bearer $CRON_SECRET`; nothing else may run a cron route. */
describe('isCronRequest', () => {
  it('accepts exactly the bearer secret', () => {
    expect(isCronRequest('Bearer s3cret', 's3cret')).toBe(true);
  });

  it('refuses a missing or wrong header, and everything when no secret is set', () => {
    expect(isCronRequest(null, 's3cret')).toBe(false);
    expect(isCronRequest('Bearer nope', 's3cret')).toBe(false);
    expect(isCronRequest('s3cret', 's3cret')).toBe(false);
    expect(isCronRequest('Bearer s3cret ', 's3cret')).toBe(false);
    expect(isCronRequest('Bearer ', '')).toBe(false);
    expect(isCronRequest('Bearer undefined', undefined)).toBe(false);
  });
});
