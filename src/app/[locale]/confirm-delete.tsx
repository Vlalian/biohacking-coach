'use client';

/**
 * A delete that asks once before it happens (`showable-version/28e`, ruling
 * 4: both kinds of record "delete for good after a confirm tap"). The first
 * tap only asks. The second, on a differently worded button, deletes.
 *
 * Stateless: the Health Drawer keeps which record is being asked about, so
 * asking about one record puts any other back to its first step.
 */
export function ConfirmDelete({
  action,
  label,
  confirmLabel,
  confirming,
  disabled,
  onAsk,
  onConfirm,
}: {
  /** `delete` for an open record declared by mistake, `remove` for a History entry. */
  action: 'delete' | 'remove';
  label: string;
  confirmLabel: string;
  confirming: boolean;
  disabled: boolean;
  onAsk: () => void;
  onConfirm: () => void;
}) {
  return confirming ? (
    <button
      type="button"
      data-action={`confirm-${action}`}
      onClick={onConfirm}
      disabled={disabled}
      className="border border-destructive h-10 px-4 font-body text-[15px] font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
    >
      {confirmLabel}
    </button>
  ) : (
    <button
      type="button"
      data-action={action}
      onClick={onAsk}
      disabled={disabled}
      className="font-body text-sm uppercase tracking-[0.16em] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
    >
      {label}
    </button>
  );
}
