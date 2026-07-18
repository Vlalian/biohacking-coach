import { setRequestLocale } from 'next-intl/server';
import { AuthForm } from '../auth-form';

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AuthForm mode="sign-up" />;
}
