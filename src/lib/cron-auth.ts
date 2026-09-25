import { timingSafeEqual } from 'node:crypto';

/**
 * Whether a request to a cron route comes from Vercel Cron, which sends
 * `Authorization: Bearer $CRON_SECRET`. With no secret configured nothing is
 * accepted: an unset variable must close the route, not open it. Compared in
 * constant time.
 */
export function isCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || authorization === null) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
