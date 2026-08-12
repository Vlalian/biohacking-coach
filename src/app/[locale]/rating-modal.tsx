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
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
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
              className="flex-1 border py-2 font-mono text-sm font-semibold transition-colors"
              style={{
                borderColor: active ? `hsl(${hue}, 60%, 48%)` : 'var(--border)',
                backgroundColor: active ? `hsl(${hue}, 45%, 90%)` : 'transparent',
                color: active ? `hsl(${hue}, 55%, 32%)` : 'var(--foreground)',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col gap-4 border border-border bg-panel p-6 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal">
            {t('title')}
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-[0.04em] text-foreground">
            {t('subtitle', { type: session.type })}
          </h2>
        </div>

        <ScoreRow label={t('body')} value={body} onPick={setBody} />
        <ScoreRow label={t('mind')} value={mind} onPick={setMind} />

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t('comment')}
          </span>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('commentPlaceholder')}
            className="resize-none border border-border bg-background p-2 font-body text-sm text-foreground outline-none focus:border-signal"
          />
        </label>

        {failed && (
          <p role="alert" className="font-body text-sm text-destructive">
            {t('error')}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-border py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('skip')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending || body < 1 || mind < 1}
            className="flex-[2] bg-signal py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
