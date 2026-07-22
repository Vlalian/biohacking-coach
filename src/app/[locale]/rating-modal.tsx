'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { Session } from '@/features/session/session';
import { rateSessionAction } from './rate-actions';

const SCORES = [1, 2, 3, 4, 5];

// RPE colour: 1 = green (hue 120), 5 = red (hue 0), matching the POC's gradient.
function rpeHue(score: number): number {
  return Math.round(120 - ((score - 1) * 120) / 4);
}

function ScoreRow({
  label,
  value,
  onPick,
}: {
  label: string;
  value: number;
  onPick: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <div className="flex gap-1.5" role="group" aria-label={label}>
        {SCORES.map((n) => {
          const active = value === n;
          const hue = rpeHue(n);
          return (
            <button
              key={n}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(n)}
              className="flex-1 rounded-md border py-2 text-sm font-semibold transition"
              style={{
                borderColor: `hsl(${hue}, ${active ? 60 : 30}%, ${active ? 48 : 40}%)`,
                backgroundColor: active ? `hsl(${hue}, 45%, 90%)` : 'transparent',
                color: `hsl(${hue}, 55%, 32%)`,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The Session Reflection modal: body and mind on RPE 1–5 plus an optional
 * comment, for a completed session. Pre-fills an existing rating so a re-rate
 * starts from what was there. Save is disabled until both scores are picked.
 */
export function RatingModal({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const t = useTranslations('Reflection');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(session.feedbackBody ?? 0);
  const [mind, setMind] = useState(session.feedbackMind ?? 0);
  const [comment, setComment] = useState(session.feedbackComment ?? '');
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus management: move focus into the dialog on open, close on Escape, keep
  // Tab inside the panel, and restore focus to the trigger on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, textarea, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, [onClose]);

  function onSave() {
    if (body < 1 || mind < 1) return;
    setFailed(false);
    startTransition(async () => {
      const result = await rateSessionAction(session.id, body, mind, comment || null);
      if (result.ok) {
        router.refresh();
        onClose();
      } else {
        setFailed(true);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 outline-none dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-500">
            {t('title')}
          </p>
          <h2 className="text-base font-semibold">
            {t('subtitle', { type: session.type })}
          </h2>
        </div>

        <ScoreRow label={t('body')} value={body} onPick={setBody} />
        <ScoreRow label={t('mind')} value={mind} onPick={setMind} />

        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
          {t('comment')}
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('commentPlaceholder')}
            className="resize-none rounded-lg border border-neutral-300 p-2 text-sm font-normal normal-case text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          />
        </label>

        {failed && (
          <p role="alert" className="text-sm text-red-600">
            {t('error')}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm text-neutral-600 dark:border-neutral-700"
          >
            {t('skip')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending || body < 1 || mind < 1}
            className="flex-[2] rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
