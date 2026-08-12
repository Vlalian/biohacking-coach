import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/**
 * The 404 page. Before this, a mistyped URL rendered Next.js's unstyled
 * default — a dead end in a different typeface than the rest of the app.
 * Locale-aware and inside the locale segment, so the copy resolves through
 * i18n like every other string, and the way back is always one tap away.
 */
export default async function NotFound() {
  const t = await getTranslations('NotFound');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal">
        {t('eyebrow')}
      </p>
      <h1 className="font-display text-5xl leading-none tracking-[0.04em] text-foreground">
        {t('title')}
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t('body')}</p>
      <Link
        href="/training-plan"
        className="mt-2 border border-signal px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground"
      >
        {t('backToPlan')}
      </Link>
    </main>
  );
}
