import { setRequestLocale } from 'next-intl/server';
import { AuthForm } from '../auth-form';
import { ThemeToggle } from '@/components/theme-toggle';

// Not prerendered: an auth page has nothing static to cache, and prerendering it
// evaluates the better-auth server module at build time — which must never gate
// the build on a deploy-time URL (slice 03).
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      {/* The theme toggle lives on the public sign-in page: it is the design
          system's own control and the natural place to set a preference before
          signing in. It also gives the baseline a real surface to verify light
          and dark against. */}
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle className="h-11 w-11 rounded-none border-auth-line bg-auth-surface/70 text-auth-foreground backdrop-blur-md hover:bg-auth-surface hover:text-auth-foreground" />
      </div>
      <AuthForm mode="sign-in" />
    </>
  );
}
