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
        await signOut();
        router.push('/sign-in');
        router.refresh();
      }}
      className="text-sm text-neutral-500 underline disabled:opacity-50"
    >
      {t('signOut')}
    </button>
  );
}
