'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { FEEDBACK_MAX_LENGTH } from '@/features/feedback/feedback';
import { disclosureCopy } from '@/features/consent/disclosure';
import { submitFeedbackAction } from './feedback-actions';
import { grantConsentsAction } from './consent-actions';

/**
 * The feedback page (`showable-version/58`): one way to give feedback, and it is
 * a plain comment field. Mads, 2026-09-30, replacing the AI Feedback Interview
 * (ADR 0009, amended): "simple and easy to understand", with guidance above the
 * box on how much to include.
 *
 * No model call, no consent gate, no conversation — it posts and it stores. A
 * failure keeps what the tester typed; only a successful send clears the box.
 *
 * To design in Lovable: built plain on the existing page styles, not designed.
 */
export function FeedbackForm({
  openedFrom,
}: {
  /** The View the escape hatch was opened from, resolved by the page. */
  openedFrom: string | null;
}) {
  const t = useTranslations('Feedback');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'error' | 'consent'>('idle');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || pending) return;
    send();
  }

  /**
   * Sends the draft, granting the product-improvement consent first when asked
   * to (garmin-connect-api/08). Granted here rather than on Privacy & consent so
   * the draft is never lost on the way (CodeRabbit, PR #130).
   */
  function send(grantFirst = false) {
    // A new send clears the last one's "Sent" or error (CodeRabbit, PR #120).
    setState('idle');
    startTransition(async () => {
      // The action rethrows a database error, and a dropped connection rejects
      // too. Left uncaught, either reaches the locale error boundary, which
      // replaces this form and the text in it with a retry screen. The tester
      // keeps their text and gets the notice instead, as `coach-thread.tsx` does.
      try {
        if (grantFirst && !(await grantConsentsAction(['product_improvement'])).ok) return setState('error');
        const result = await submitFeedbackAction({ body, view: openedFrom });
        setState(result.ok ? 'sent' : result.reason === 'consent-required' ? 'consent' : 'error');
        if (result.ok) setBody('');
      } catch {
        setState('error');
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-5xl font-bold uppercase italic leading-none tracking-[0.03em] text-foreground">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-[62ch] font-body text-base leading-relaxed text-muted-foreground">
          {t('intro')}
        </p>
      </header>

      <section className="flex flex-col gap-3 border border-border bg-panel p-5">
        <ul className="flex list-disc flex-col gap-1 pl-5 font-body text-base leading-relaxed text-foreground">
          <li>{t('guidanceWhat')}</li>
          <li>{t('guidanceWhere')}</li>
          <li>{t('guidanceExpected')}</li>
        </ul>
        <p className="font-body text-sm text-muted-foreground">{t('guidanceLength')}</p>

        <form onSubmit={submit} className="mt-1 flex flex-col gap-2">
          <label htmlFor="feedback-comment" className="sr-only">
            {t('label')}
          </label>
          <textarea
            id="feedback-comment"
            rows={5}
            maxLength={FEEDBACK_MAX_LENGTH}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('placeholder')}
            className="resize-y border border-border bg-background p-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || body.trim().length === 0}
              className="inline-flex h-11 items-center self-start bg-foreground px-5 font-body text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-35"
            >
              {t('send')}
            </button>
            {state !== 'idle' && (
              <span
                role="status"
                className={[
                  'inline-flex items-center gap-1.5 font-body text-sm',
                  state === 'sent' ? 'text-signal' : 'text-destructive',
                ].join(' ')}
              >
                {state === 'sent' && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {state === 'sent' ? (
                  t('sent')
                ) : state === 'consent' ? (
                  t('consentRequired')
                ) : (
                  t('error')
                )}
              </span>
            )}
          </div>
          {state === 'consent' && (
            <ProductImprovementConsent locale={locale} pending={pending} label={t('consentAllowAndSend')} onAllow={() => send(true)} />
          )}
        </form>
      </section>
    </div>
  );
}

/** The "Help improve the product" consent, in the disclosure's own words, offered where the feedback waits. */
function ProductImprovementConsent({
  locale,
  pending,
  label,
  onAllow,
}: {
  locale: string;
  pending: boolean;
  label: string;
  onAllow: () => void;
}) {
  const copy = disclosureCopy(locale).purposes.product_improvement;
  return (
    <section className="border border-border p-4">
      <h3 className="font-body text-base font-semibold text-foreground">{copy.title}</h3>
      <p className="mt-1 font-body text-sm text-muted-foreground">{copy.body}</p>
      <button
        type="button"
        onClick={onAllow}
        disabled={pending}
        className="mt-3 inline-flex h-10 items-center bg-foreground px-4 font-body text-sm font-semibold text-background disabled:opacity-35"
      >
        {label}
      </button>
    </section>
  );
}
