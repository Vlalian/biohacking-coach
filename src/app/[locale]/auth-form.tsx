'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
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
 *
 * The look is the Lovable sign-in export (2026-09-24): a night-ride photo
 * under a dark canvas in both themes, the form on a red-edged surface, the
 * Momentum name with its full stop in signal red. The `auth-*` tokens live in
 * globals.css and hold the same contrast bar as the rest of the palette.
 *
 * On success it pushes to '/', the gate page, which sends a returning athlete
 * on in the language they stored (showable-version/34).
 *
 * `allowSignUp` is the deployment's `DISABLE_SIGNUP`, read on the server and
 * passed in: while registration is closed the sign-in page offers no way to a
 * form better-auth would refuse (showable-version/04). It defaults to open, so
 * a local dev server behaves as it always has.
 */

const INPUT =
  'mt-2 h-12 w-full border border-auth-line bg-auth-input px-4 text-base text-auth-foreground outline-none transition-colors placeholder:text-auth-muted focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary';
const LABEL = 'block font-body text-[13px] font-semibold uppercase tracking-[0.16em] text-auth-muted';

export function AuthForm({
  mode,
  allowSignUp = true,
}: {
  mode: 'sign-in' | 'sign-up';
  allowSignUp?: boolean;
}) {
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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-auth-canvas px-4 py-16">
      <Image
        src="/momentum-signin-cyclist.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[58%_center] opacity-70"
      />
      <div className="auth-backdrop absolute inset-0" aria-hidden="true" />
      <div className="auth-speed-lines absolute inset-0 opacity-30" aria-hidden="true" />

      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-md border-l-4 border-signal bg-auth-surface/90 p-7 text-auth-foreground shadow-2xl backdrop-blur-xl sm:p-10"
      >
        <header className="mb-9">
          <p className="font-display text-5xl font-bold uppercase italic leading-none text-auth-foreground">
            Momentum<span className="text-sidebar-primary">.</span>
          </p>
          <div className="mt-3 h-1 w-12 bg-signal" aria-hidden="true" />
          <h1 className="mt-4 font-body text-[13px] font-semibold uppercase tracking-[0.16em] text-auth-muted">
            {isSignUp ? t('signUpTitle') : t('signInTitle')}
          </h1>
        </header>

        <div className="space-y-5">
          {isSignUp && (
            <div>
              <label className={LABEL} htmlFor="auth-name">
                {t('nameLabel')}
              </label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
              />
            </div>
          )}

          <div>
            <label className={LABEL} htmlFor="auth-email">
              {t('emailLabel')}
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="auth-password">
              {t('passwordLabel')}
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>

        {failed && (
          <p role="alert" className="mt-4 font-body text-[15px] text-sidebar-primary">
            {t('error')}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="group mt-7 inline-flex h-11 w-full items-center justify-center gap-2 bg-auth-foreground font-body text-base font-bold uppercase tracking-[0.12em] text-auth-canvas transition-colors hover:bg-signal hover:text-signal-foreground disabled:opacity-50"
        >
          {isSignUp ? t('signUpButton') : t('signInButton')}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>

        {(isSignUp || allowSignUp) && (
          <p className="mt-5 text-center font-body text-sm text-auth-muted">
            {isSignUp ? (
              <Link
                href="/sign-in"
                className="underline decoration-sidebar-primary underline-offset-4 transition-colors hover:text-auth-foreground"
              >
                {t('toSignIn')}
              </Link>
            ) : (
              <Link
                href="/sign-up"
                className="underline decoration-sidebar-primary underline-offset-4 transition-colors hover:text-auth-foreground"
              >
                {t('toSignUp')}
              </Link>
            )}
          </p>
        )}
      </form>
    </main>
  );
}
