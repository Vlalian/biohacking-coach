'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { signOut } from '@/lib/auth-client';

/**
 * Ends the session and returns to sign-in. router.refresh() drops the server
 * component's cached session so the protected page re-evaluates and redirects,
 * rather than briefly showing a stale greeting.
 */
export function SignOutButton() {
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
      className="text-sm text-neutral-500 underline disabled:opacity-50"
    >
      {t('signOut')}
    </button>
  );
}
