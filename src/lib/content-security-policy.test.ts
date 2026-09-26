import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOB_UPLOAD_HOSTS, CONTENT_SECURITY_POLICY } from './content-security-policy';

function directive(name: string): string[] {
  const found = CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith(`${name} `));
  return found ? found.split(' ').slice(1) : [];
}

/** Whether a CSP host source (`https://*.example.com` or `https://example.com`) admits a URL. */
function admits(source: string, url: string): boolean {
  if (!source.startsWith('https://') && !source.startsWith('http://')) return false; // a keyword, e.g. 'self'
  const target = new URL(url);
  const { protocol, hostname } = new URL(source.replace('*.', 'wildcard.'));
  if (protocol !== target.protocol) return false;
  if (!source.includes('*.')) return hostname === target.hostname;
  const suffix = hostname.slice('wildcard'.length);
  return target.hostname.endsWith(suffix) && target.hostname.length > suffix.length;
}

/**
 * The API host the installed Blob SDK uploads to, read from the package itself —
 * so an SDK that moves host fails this test instead of hanging at 0 % in the
 * browser (garmin-integration/05).
 */
function sdkUploadUrl(): string {
  const require = createRequire(import.meta.url);
  const dist = dirname(require.resolve('@vercel/blob'));
  const source = readdirSync(dist)
    .filter((f) => /\.c?js$/.test(f))
    .map((f) => readFileSync(join(dist, f), 'utf8'))
    .join('\n');
  const match = source.match(/defaultVercelBlobApiUrl = "([^"]+)"/);
  if (!match) throw new Error('the Blob SDK no longer names its API URL where this test looks');
  return match[1];
}

describe('the Content Security Policy (garmin-integration/05)', () => {
  it('lets the browser reach the host the Blob SDK uploads to', () => {
    const connect = directive('connect-src');
    expect(connect.some((source) => admits(source, sdkUploadUrl()))).toBe(true);
  });

  it('names exactly self and the Blob upload hosts in connect-src, and nothing unsafe', () => {
    expect(directive('connect-src')).toEqual(["'self'", ...BLOB_UPLOAD_HOSTS]);
    expect(BLOB_UPLOAD_HOSTS.every((h) => h.startsWith('https://'))).toBe(true);
  });

  it('leaves every other directive as it was', () => {
    expect(CONTENT_SECURITY_POLICY.split('; ').filter((d) => !d.startsWith('connect-src '))).toEqual([
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]);
  });

  it('matches host sources exactly, and a wildcard only on a real subdomain', () => {
    expect(admits('https://vercel.com', 'https://vercel.com/api/blob')).toBe(true);
    expect(admits('https://vercel.com', 'https://evil-vercel.com/x')).toBe(false);
    expect(admits('https://vercel.com', 'http://vercel.com/x')).toBe(false);
    expect(admits("'self'", 'https://vercel.com/api/blob')).toBe(false);
    expect(admits('https://*.blob.vercel-storage.com', 'https://abc.private.blob.vercel-storage.com/f')).toBe(true);
    expect(admits('https://*.blob.vercel-storage.com', 'https://blob.vercel-storage.com/f')).toBe(false);
    expect(admits('https://*.blob.vercel-storage.com', 'https://abc.blob.vercel-storage.com.evil.io/f')).toBe(false);
  });
});
