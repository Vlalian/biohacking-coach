'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

/**
 * The route error boundary. Without it, a thrown server or render error showed
 * Next.js's default error screen — in dev a stack trace, in production a bare
 * "Application error" with no way forward. This catches it, keeps the athlete
 * inside the product's own voice, and offers the retry that `reset()` makes
 * possible.
 *
 * Deliberately says nothing about *what* failed: the message could carry
 * internals, and an athlete can act on "try again" but not on a stack frame.
 * The real detail goes to the console for whoever is debugging.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('ErrorPage');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-destructive">
        {t('eyebrow')}
      </p>
      <h1 className="font-display text-5xl leading-none tracking-[0.04em] text-foreground">
        {t('title')}
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t('body')}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 border border-signal px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground"
      >
        {t('retry')}
      </button>
    </main>
  );
}
