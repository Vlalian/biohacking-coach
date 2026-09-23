'use client';

import { useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { PASSWORD_MIN, checkPassword, type PasswordRefusal } from '@/features/user-prefs/password-rules';

/**
 * Change password, in Settings › Profile (showable-version/04).
 *
 * A tester's welcome email carries their first password and is filed with it,
 * so the first thing they can do is make it theirs. The current password is
 * checked server-side by better-auth; everything the form can see for itself —
 * the two new ones matching, and `password-rules.ts` — it refuses locally, and
 * says which rule refused. A failure from the server stays generic, like the
 * sign-in form (`auth-form.tsx`).
 */

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  /** Whose account this is: a password may not be built from either (2026-09-23). */
  email: string;
  name?: string;
}

export type PasswordOutcome = { outcome: 'changed' | 'mismatch' | 'failed' } | ({ outcome: 'refused' } & PasswordRefusal);

/** The submit rule, apart from the form so it can be held to a test without a DOM. */
export async function submitPasswordChange(change: PasswordChange): Promise<PasswordOutcome> {
  if (change.newPassword !== change.confirmPassword) return { outcome: 'mismatch' };
  const refusal = checkPassword({ password: change.newPassword, email: change.email, name: change.name });
  if (refusal) return { outcome: 'refused', ...refusal };
  try {
    const result = await authClient.changePassword({
      currentPassword: change.currentPassword,
      newPassword: change.newPassword,
      // The old password may have been read by whoever handled the email;
      // every other session it opened ends now.
      revokeOtherSessions: true,
    });
    return { outcome: result.error ? 'failed' : 'changed' };
  } catch {
    return { outcome: 'failed' };
  }
}

const INPUT =
  'w-full border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-signal';

export function ChangePasswordForm({ email, name }: { email: string; name?: string }) {
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
      email,
      name,
    });
    setPending(false);
    setOutcome(result);
    if (result.outcome === 'changed') form.reset();
  }

  const fields: { name: keyof PasswordChange; label: string; autoComplete: string }[] = [
    { name: 'currentPassword', label: t('currentPassword'), autoComplete: 'current-password' },
    { name: 'newPassword', label: t('newPassword', { min: PASSWORD_MIN }), autoComplete: 'new-password' },
    { name: 'confirmPassword', label: t('confirmPassword'), autoComplete: 'new-password' },
  ];

  return (
    <form data-change-password onSubmit={onSubmit} className="space-y-3 border-t border-rule pt-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t('changePassword')}
      </p>
      {/* No `minLength` on these: it blocks the submit with the browser's own
          bubble, in the browser's language, and `password-rules.ts` never gets
          to say which rule refused and by how much. `required` stays — an empty
          field has nothing to explain. */}
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
            {t(messageKey(outcome), messageValues(outcome))}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * One message per outcome, and for a refusal one that names the rule. "Needs
 * 12 characters, you have 9" is something a person can act on; "invalid
 * password" is not.
 */
export function messageKey(outcome: PasswordOutcome): string {
  if (outcome.outcome !== 'refused') {
    if (outcome.outcome === 'changed') return 'passwordChanged';
    return outcome.outcome === 'mismatch' ? 'passwordMismatch' : 'passwordError';
  }
  switch (outcome.problem) {
    case 'tooShort':
      return 'passwordTooShort';
    case 'tooLong':
      return 'passwordTooLong';
    case 'common':
      return 'passwordTooCommon';
    default:
      return 'passwordPersonal';
  }
}

/** The numbers a refusal message needs; empty for everything else. */
export function messageValues(outcome: PasswordOutcome): Record<string, number> {
  if (outcome.outcome !== 'refused') return {};
  if (outcome.problem === 'tooShort') return { min: outcome.min, actual: outcome.actual };
  if (outcome.problem === 'tooLong') return { max: outcome.max };
  return {};
}
