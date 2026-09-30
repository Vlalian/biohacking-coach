'use client';

import { Loader2 } from 'lucide-react';

/**
 * The bordered action button Settings' race lists use, and the shared race
 * form (`training-architecture/37`). Moved out of `settings-races.tsx` so the
 * form can live beside the calendar without importing Settings back.
 */
export function ActionButton({
  onClick,
  disabled,
  label,
  pending,
  quiet,
  'data-action': dataAction,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  pending?: boolean;
  quiet?: boolean;
  'data-action'?: string;
}) {
  return (
    <button
      type="button"
      data-action={dataAction}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-2 border h-10 px-4 font-body text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent',
        quiet
          ? 'border-border text-muted-foreground hover:text-foreground'
          : 'border-signal text-signal hover:bg-signal hover:text-signal-foreground',
      ].join(' ')}
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  );
}
