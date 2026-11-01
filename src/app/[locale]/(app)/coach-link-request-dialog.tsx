'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { disclosureCopy } from '@/features/consent/disclosure';
import type { PendingLinkRequest } from '@/features/coach/coach-repository';
import { acceptCoachingLinkAction, declineCoachingLinkAction } from '../coaching-link-actions';

/**
 * A pending Coaching Link, put to the athlete (`training-architecture/14`, Mads
 * 2026-10-31). The coach sees nothing until the athlete says yes here, which
 * grants the Head-Coach-visibility consent; no severs the link. The consent's
 * words are the disclosure's own, so what is shown is what is agreed to.
 *
 * Read on the render path by the layout, like the Head Coach's chores, and shown
 * on every page until it is answered: closing it is "not now", for this view
 * only. Built plain on the existing tokens; the design pass is Lovable's.
 */
export function CoachLinkRequestDialog({ request }: { request: PendingLinkRequest }) {
  const t = useTranslations('CoachLinkRequest');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState(false);
  const panelRef = useDialogFocus<HTMLDivElement>(() => setHidden(true), !hidden);
  if (hidden) return null;

  const copy = disclosureCopy(locale).purposes.head_coach_visibility;

  function answer(action: (linkId: string) => Promise<{ ok: boolean }>) {
    setFailed(false);
    startTransition(async () => {
      const result = await action(request.linkId).catch(() => ({ ok: false }));
      if (!result.ok) return setFailed(true);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-link-request-title"
        className="w-full max-w-md border border-border bg-panel p-5 shadow-2xl outline-none"
      >
        <h2 id="coach-link-request-title" className="font-display text-xl font-bold text-foreground">
          {t('title', { coach: request.coachName })}
        </h2>
        <p className="mt-2 font-body text-sm text-muted-foreground">{t('intro')}</p>
        <h3 className="mt-4 font-body text-base font-semibold text-foreground">{copy.title}</h3>
        <p className="mt-1 font-body text-sm text-muted-foreground">{copy.body}</p>
        {failed && (
          <p role="alert" className="mt-3 font-body text-sm text-destructive">
            {t('error')}
          </p>
        )}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => answer(acceptCoachingLinkAction)}
            disabled={pending}
            className="inline-flex h-10 items-center bg-foreground px-4 font-body text-sm font-semibold text-background disabled:opacity-35"
          >
            {t('accept')}
          </button>
          <button
            type="button"
            onClick={() => answer(declineCoachingLinkAction)}
            disabled={pending}
            className="font-body text-sm text-muted-foreground hover:text-foreground disabled:opacity-35"
          >
            {t('decline')}
          </button>
        </div>
      </div>
    </div>
  );
}
