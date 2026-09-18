'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { PREFERRED_NAME_MAX, matchesAccountName } from '@/features/user-prefs/preferred-name';

/**
 * The Preferred Name field — what the athlete types for the Coach to call them
 * (`preferred-name/02`) — with the real-name warning built in, so onboarding
 * and Settings cannot drift on the one rule that matters here.
 *
 * The rule: **empty by default, nothing prefilled, and a typed value that is
 * (a token of) the account name warns before it is committed.** A warning,
 * not a block (Mads, 2026-08-21): the athlete may genuinely want to be called
 * by their first name, and refusing would have the app overrule someone on
 * what they wish to be called. What the warning buys is that a real name never
 * arrives by accident or by default — only after someone read a sentence
 * saying so. Advisory by nature, so client-side is sufficient; it is not a
 * control and must not be described as one.
 *
 * The component owns the draft and the warning state and hands the caller one
 * thing: `onCommit(value)` with what the athlete decided, called only once the
 * warning (if any) was answered. The caller renders its own actions through
 * `actions`, receiving `commit` to wire them to, so onboarding's Continue/Skip
 * and Settings' Save can look like their own screens.
 */
export function PreferredNameField({
  accountName,
  initialValue = '',
  disabled = false,
  onCommit,
  onChange,
  actions,
}: {
  /** `user.name`, for the warning only — never shown, never prefilled. */
  accountName: string;
  /** The stored name, in Settings; empty in onboarding. */
  initialValue?: string;
  disabled?: boolean;
  /** Called with the decided value once any warning was answered. */
  onCommit: (value: string) => void;
  /** Fires on every edit, for a caller that tracks dirtiness. */
  onChange?: (value: string) => void;
  /** The caller's buttons. `commit` runs the warning check, then `onCommit`. */
  actions: (commit: (value: string) => void, draft: string) => ReactNode;
}) {
  const t = useTranslations('PreferredName');
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialValue);
  const [warning, setWarning] = useState<string | null>(null);

  function commit(value: string) {
    if (matchesAccountName(value, accountName)) {
      setWarning(value);
      return;
    }
    onCommit(value);
  }

  function pickAnother() {
    setWarning(null);
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  return (
    <div className="space-y-4">
      <label htmlFor={id} className="sr-only">
        {t('placeholder')}
      </label>
      <input
        ref={inputRef}
        id={id}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setWarning(null);
          onChange?.(e.target.value);
        }}
        placeholder={t('placeholder')}
        maxLength={PREFERRED_NAME_MAX}
        autoComplete="off"
        disabled={disabled}
        className="w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-signal"
      />

      {warning !== null ? (
        <div
          role="alertdialog"
          aria-live="polite"
          className="space-y-3 border border-signal/50 bg-signal/5 px-4 py-3"
        >
          <p className="flex items-start gap-3 font-body text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
            {t('realNameWarning')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onCommit(warning)}
              className="inline-flex items-center border border-signal px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground disabled:opacity-40"
            >
              {t('useAnyway')}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={pickAnother}
              className="inline-flex items-center border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {t('pickAnother')}
            </button>
          </div>
        </div>
      ) : (
        actions(commit, draft)
      )}
    </div>
  );
}
