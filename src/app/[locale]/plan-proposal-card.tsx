'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { DEFAULT_TYPE_COLOR, TYPE_COLORS } from '@/features/session/type-colors';
import { useDialogFocus } from '@/lib/use-dialog-focus';

/** One proposed session, as the confirmation popup shows it. */
export interface UiPlanSession {
  date: string;
  type: string;
  durationMinutes: number | null;
  zone: string | null;
  note: string | null;
}

export interface UiPlanProposal {
  sessions: UiPlanSession[];
}

/**
 * The Action Proposal card for a proposed week: the popup the athlete decides
 * in, and the persistent bar it drops to when dismissed — so a pending plan can
 * always be reviewed, saved or cancelled, never stranded (CONTEXT.md, Action
 * Proposal: only the tap commits).
 *
 * Lifted out of the Weekly Session when Coach Chat gained the week proposal
 * (`training-architecture/20`): one card, two hosts, so the athlete decides a
 * week the same way whichever conversation proposed it. The strings stay under
 * the `WeeklySession` namespace — the same words, not a second copy.
 *
 * Decisions are the host's: it owns the proposal state and the server calls,
 * and tells this component what to show. Escape closes the popup rather than
 * the conversation, the same as before the lift.
 */
export function PlanProposalCard({
  proposal,
  pending,
  popupOpen,
  onReview,
  onKeepTalking,
  onConfirm,
  onCancel,
}: {
  proposal: UiPlanProposal;
  pending: boolean;
  popupOpen: boolean;
  /** Reopen the popup from the bar. */
  onReview: () => void;
  /** Dismiss the popup to the bar. */
  onKeepTalking: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('WeeklySession');
  const format = useFormatter();
  const proposalRef = useDialogFocus(onKeepTalking, popupOpen);

  function planLine(s: UiPlanSession): string {
    const day = format.dateTime(new Date(`${s.date}T00:00:00`), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const bits = [
      day,
      s.type,
      s.durationMinutes != null ? t('minutes', { count: s.durationMinutes }) : null,
      s.zone,
    ].filter(Boolean);
    return bits.join(' · ');
  }

  if (!popupOpen) {
    return (
      <div className="shrink-0 border-t border-signal/40 bg-signal/5 px-4 py-3">
        <p className="font-body text-sm text-foreground">
          {t('proposalPending', { count: proposal.sessions.length })}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <GhostButton onClick={onReview} disabled={pending}>
            {t('reviewPlan')}
          </GhostButton>
          <GhostButton onClick={onCancel} disabled={pending}>
            {t('cancelPlan')}
          </GhostButton>
          <PrimaryButton onClick={onConfirm} disabled={pending}>
            {t('savePlan')}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-proposal-title"
    >
      <div
        ref={proposalRef}
        tabIndex={-1}
        className="flex max-h-[80%] w-full max-w-sm flex-col border border-border bg-panel shadow-2xl outline-none"
      >
        <div className="border-b border-rule px-5 py-4">
          <h3 id="plan-proposal-title" className="font-display text-xl tracking-[0.03em] text-foreground">
            {t('proposalTitle')}
          </h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">{t('proposalIntro')}</p>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-rule overflow-y-auto">
          {proposal.sessions.map((s, i) => {
            const color = TYPE_COLORS[s.type] ?? DEFAULT_TYPE_COLOR;
            return (
              <li key={`${s.date}-${i}`} className="flex gap-3 px-5 py-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <div className="min-w-0 flex-1">
                  <div className="font-body text-sm text-foreground">{planLine(s)}</div>
                  {s.note && (
                    <div className="mt-0.5 font-body text-xs text-muted-foreground">{s.note}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-4">
          <GhostButton onClick={onCancel} disabled={pending}>
            {t('cancelPlan')}
          </GhostButton>
          <GhostButton onClick={onKeepTalking} disabled={pending}>
            {t('keepTalking')}
          </GhostButton>
          <PrimaryButton onClick={onConfirm} disabled={pending}>
            {t('savePlan')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-signal hover:text-signal disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-signal px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
