import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { CONTENT_SECURITY_POLICY } from './src/lib/content-security-policy';

const withNextIntl = createNextIntlPlugin();

// Security headers on every response; the CSP and why it reads as it does
// live in `src/lib/content-security-policy.ts` (slice 16, garmin-integration/05).
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
