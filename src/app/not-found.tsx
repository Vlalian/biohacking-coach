import Link from 'next/link';

/**
 * The root 404 — the last-resort fallback for a path that never reached a
 * locale segment at all (so there is no locale to translate into, and no
 * provider mounted). The localised 404 an athlete actually sees lives at
 * `[locale]/not-found.tsx`, reached through the `[locale]/[...rest]`
 * catch-all; this exists so the un-localised edge is still styled rather
 * than Next.js's bare default.
 *
 * Deliberately plain: no i18n hooks, no client components, no links into a
 * locale that was never resolved.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          background: '#12100e',
          color: '#f5f1ea',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '2rem', letterSpacing: '0.04em' }}>
          This page doesn&apos;t exist
        </h1>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.875rem' }}>
          The link may be old, or the address slightly off.
        </p>
        <Link
          href="/"
          style={{
            marginTop: '0.5rem',
            padding: '0.625rem 1rem',
            border: '1px solid #e5484d',
            color: '#e5484d',
            textDecoration: 'none',
            fontSize: '0.75rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          Back to the app
        </Link>
      </body>
    </html>
  );
}
