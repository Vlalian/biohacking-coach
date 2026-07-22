import { setRequestLocale } from 'next-intl/server';
import { AuthForm } from '../auth-form';
import { ThemeToggle } from '@/components/theme-toggle';

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
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <AuthForm mode="sign-in" />
    </>
  );
}
