'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { signIn, signUp } from '@/lib/auth-client';

/**
 * Sign-in and sign-up are the same form with one extra field, so they are one
 * component. Signing up mints the athlete row server-side (the create hook), so
 * on success either mode lands on the protected page the same way.
 *
 * Errors are shown as one generic localized message rather than better-auth's
 * raw text: it keeps the UI translatable and avoids telling a stranger whether
 * an email is already registered.
 */
export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  const isSignUp = mode === 'sign-up';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFailed(false);
    setPending(true);

    try {
      const result = isSignUp
        ? await signUp.email({ name, email, password })
        : await signIn.email({ email, password });

      if (result.error) {
        setFailed(true);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      // A thrown request (network, etc.) is a failure like any other; show the
      // generic message rather than leaving the form wedged.
      setFailed(true);
    } finally {
      // Always re-enable the form — without finally, a throw would leave the
      // submit button disabled with no way forward.
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold">
          {isSignUp ? t('signUpTitle') : t('signInTitle')}
        </h1>

        {isSignUp && (
          <label className="flex flex-col gap-1 text-sm">
            {t('nameLabel')}
            <input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded border border-neutral-300 px-3 py-2 text-base"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          {t('emailLabel')}
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t('passwordLabel')}
          <input
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-base"
          />
        </label>

        {failed && (
          <p role="alert" className="text-sm text-red-600">
            {t('error')}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {isSignUp ? t('signUpButton') : t('signInButton')}
        </button>

        <p className="text-center text-sm text-neutral-500">
          {isSignUp ? (
            <Link href="/sign-in" className="underline">
              {t('toSignIn')}
            </Link>
          ) : (
            <Link href="/sign-up" className="underline">
              {t('toSignUp')}
            </Link>
          )}
        </p>
      </form>
    </main>
  );
}
