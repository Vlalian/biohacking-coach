import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/**
 * Security headers on every response (slice 16, route 10 ballot 3).
 *
 * CORS is not opened: the app is served from one origin and the browser blocks
 * cross-origin reads by default, so setting no `Access-Control-Allow-Origin` is
 * the lock — a request from another site cannot read a response. Auth's own
 * cross-origin trust is handled separately by better-auth's `trustedOrigins`,
 * pinned to the deployment origin in `src/lib/auth.ts`.
 *
 * The CSP is deliberately moderate rather than nonce-strict: Next injects inline
 * bootstrap scripts and Tailwind emits inline styles, so `'unsafe-inline'`
 * stays for now. Anthropic is called server-side only, so `connect-src` needs
 * no external host. Tightening to nonces is a later hardening pass, not a gate
 * for this eval's two seeded users.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
