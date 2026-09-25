import { createHash } from 'node:crypto';

/**
 * A name-based UUID (RFC 4122 version 5): the same namespace and name give the
 * same id on every run, on every machine. This is how the seed keeps a fixed
 * row per athlete without a fixed literal per row — `seedAthleteSessionId`
 * (seed-history) and each tester coach's own persona copy (code-health/18)
 * both derive from it.
 */
export function uuidV5(namespace: string, name: string): string {
  const hash = createHash('sha1')
    .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
    .update(name)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
