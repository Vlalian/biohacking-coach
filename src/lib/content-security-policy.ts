/**
 * The hosts the browser calls for a Garmin upload (`garmin-integration/04`): the
 * files go straight to Vercel Blob because a function body is capped at 4.5 MB.
 * `upload()` from `@vercel/blob/client` sends to `https://vercel.com/api/blob`;
 * the store's own host, `<store>.<access>.blob.vercel-storage.com`, is where the
 * SDK builds blob URLs. Without these the header refused every upload and the
 * progress bar sat at 0 % with no error (`garmin-integration/05`). The test
 * reads the SDK's API URL from the installed package, so the two cannot drift
 * apart in silence again.
 */
export const BLOB_UPLOAD_HOSTS = ['https://vercel.com', 'https://*.blob.vercel-storage.com'] as const;

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
 * stays for now. Anthropic is called server-side only; the one external host
 * the browser itself calls is Vercel Blob, for Garmin uploads (below).
 * Tightening to nonces is a later hardening pass, not a gate
 * for this eval's two seeded users.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  ["connect-src", "'self'", ...BLOB_UPLOAD_HOSTS].join(' '),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
