'use client';

import { useTranslations } from 'next-intl';
import { CheckInStep, type CheckInReport } from './check-in-step';

/**
 * The single sanctioned proactive nudge (ADR 0007), as the Check-in reminder
 * it became when the Weekly Session was retired (`training-architecture/21`).
 *
 * Two states, both the host's to decide: the banner asking for a quick
 * check-in, and the Check-in step it opens in place. Presentational on purpose
 * — the thread owns whether it is open, pending or dismissed — so both states
 * can be rendered and read without a browser.
 */
export function CheckInReminder({
  open,
  pending,
  failed,
  onOpen,
  onSkip,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  failed: boolean;
  onOpen: () => void;
  /** Skipping changes nothing: the week is drafted and the Coach is told it has no report. */
  onSkip: () => void;
  onSubmit: (report: CheckInReport) => void;
}) {
  const t = useTranslations('CoachThread');
  return (
    <div data-check-in-reminder className="shrink-0 border-b border-signal/40 bg-signal/5 px-4 py-3">
      {open ? (
        <>
          <CheckInStep pending={pending} onSubmit={onSubmit} onSkip={onSkip} />
          {failed && (
            <p role="alert" className="mt-2 font-body text-sm text-destructive">
              {t('checkInError')}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-foreground">{t('offerBody')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              data-action="open-check-in"
              onClick={onOpen}
              className="bg-signal px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal-foreground transition-opacity hover:opacity-90"
            >
              {t('offerAccept')}
            </button>
            <button
              type="button"
              data-action="dismiss-check-in"
              onClick={onSkip}
              className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('offerDismiss')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
