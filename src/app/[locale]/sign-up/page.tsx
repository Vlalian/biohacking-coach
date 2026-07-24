import { setRequestLocale } from 'next-intl/server';
import { AuthForm } from '../auth-form';

// Not prerendered — see the sign-in page: an auth page evaluates the better-auth
// module, which must not gate the build on a deploy-time URL (slice 03).
export const dynamic = 'force-dynamic';

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AuthForm mode="sign-up" />;
}
