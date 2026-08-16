'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { signOut } from '@/lib/auth-client';

/**
 * Ends the session and returns to sign-in. router.refresh() drops the server
 * component's cached session so the protected page re-evaluates and redirects,
 * rather than briefly showing a stale greeting.
 *
 * Shared across every context that needs a way out: the pre-shell gates (no
 * profile, consent, onboarding — still their original, un-reskinned styling),
 * the app shell's Navigation Drawer, and Settings. `className` lets each
 * context supply its own look; the default is the original plain-link style
 * so the pre-shell gates render unchanged. `icon` is an optional leading
 * element (e.g. a nav-row icon) rendered before the label.
 */
export function SignOutButton({
  className,
  icon,
}: { className?: string; icon?: ReactNode } = {}) {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const result = await signOut();
          // Only leave the page if the session actually ended; on failure stay
          // put and re-enable the button rather than navigating to a page the
          // still-valid session would just bounce back from.
          if (!result.error) {
            router.push('/sign-in');
            router.refresh();
          }
        } finally {
          setPending(false);
        }
      }}
      className={className ?? 'text-sm text-neutral-500 underline disabled:opacity-50'}
    >
      {icon}
      {t('signOut')}
    </button>
  );
}
