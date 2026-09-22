'use client';

import { useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';

/**
 * Change password, in Settings › Profile (showable-version/04).
 *
 * A tester's welcome email carries their first password and is filed with
 * it, so the first thing they can do is make it theirs. better-auth's
 * email/password plugin owns the rule (current password checked server-side,
 * eight characters minimum); this form only refuses what it can see —
 * a mismatch, a short one — and otherwise reports the outcome in one line,
 * generic on failure like the sign-in form (`auth-form.tsx`).
 */

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type PasswordOutcome = 'changed' | 'mismatch' | 'tooShort' | 'failed';

/** better-auth's floor for a password; the form mirrors it so a refusal is local and instant. */
export const PASSWORD_MIN = 8;

/** The submit rule, apart from the form so it can be held to a test without a DOM. */
export async function submitPasswordChange(change: PasswordChange): Promise<PasswordOutcome> {
  if (change.newPassword !== change.confirmPassword) return 'mismatch';
  if (change.newPassword.length < PASSWORD_MIN) return 'tooShort';
  try {
    const result = await authClient.changePassword({
      currentPassword: change.currentPassword,
      newPassword: change.newPassword,
      // The old password may have been read by whoever handled the email;
      // every other session it opened ends now.
      revokeOtherSessions: true,
    });
    return result.error ? 'failed' : 'changed';
  } catch {
    return 'failed';
  }
}

const INPUT =
  'w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-signal';

export function ChangePasswordForm() {
  const t = useTranslations('Settings');
  const id = useId();
  const [outcome, setOutcome] = useState<PasswordOutcome | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setOutcome(null);
    const result = await submitPasswordChange({
      currentPassword: String(data.get('currentPassword') ?? ''),
      newPassword: String(data.get('newPassword') ?? ''),
      confirmPassword: String(data.get('confirmPassword') ?? ''),
    });
    setPending(false);
    setOutcome(result);
    if (result === 'changed') form.reset();
  }

  const fields: { name: keyof PasswordChange; label: string; autoComplete: string }[] = [
    { name: 'currentPassword', label: t('currentPassword'), autoComplete: 'current-password' },
    { name: 'newPassword', label: t('newPassword'), autoComplete: 'new-password' },
    { name: 'confirmPassword', label: t('confirmPassword'), autoComplete: 'new-password' },
  ];

  return (
    <form data-change-password onSubmit={onSubmit} className="space-y-3 border-t border-rule pt-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t('changePassword')}
      </p>
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={`${id}-${f.name}`} className="sr-only">
            {f.label}
          </label>
          <input
            id={`${id}-${f.name}`}
            name={f.name}
            type="password"
            autoComplete={f.autoComplete}
            placeholder={f.label}
            required
            minLength={f.name === 'currentPassword' ? undefined : PASSWORD_MIN}
            disabled={pending}
            className={INPUT}
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-signal hover:text-signal disabled:opacity-50"
        >
          {t('changePassword')}
        </button>
        {outcome && (
          <p role="status" className="font-body text-xs text-muted-foreground">
            {t(outcomeKey(outcome))}
          </p>
        )}
      </div>
    </form>
  );
}

function outcomeKey(outcome: PasswordOutcome): string {
  switch (outcome) {
    case 'changed':
      return 'passwordChanged';
    case 'mismatch':
      return 'passwordMismatch';
    case 'tooShort':
      return 'passwordTooShort';
    default:
      return 'passwordError';
  }
}
