import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { AuthForm } from '../auth-form';

// Not prerendered — see the sign-in page: an auth page evaluates the better-auth
// module, which must not gate the build on a deploy-time URL (slice 03).
export const dynamic = 'force-dynamic';

/**
 * While registration is closed, this route is a dead end: better-auth refuses
 * the submission and the form shows its generic error, which reads as "you
 * typed something wrong" rather than "this door is shut" (showable-version/04).
 * So the route sends the visitor where they can actually get in. The sign-in
 * page drops its link to here at the same time, off the same flag; when
 * registration reopens, both come back without a code change.
 *
 * `DISABLE_SIGNUP === 'true'` is better-auth's own test (`src/lib/auth.ts`),
 * repeated exactly so the page cannot disagree with the server about it.
 */
export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (process.env.DISABLE_SIGNUP === 'true') redirect({ href: '/sign-in', locale });

  return <AuthForm mode="sign-up" />;
}
