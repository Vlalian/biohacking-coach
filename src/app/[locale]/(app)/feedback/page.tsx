import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getCurrentSession } from '../current-user';
import { submittedFromView } from '@/features/feedback/feedback';
import { FeedbackForm } from '../../feedback-form';

// Signed out, it is not a page at all — it redirects to sign-in, so it is read
// per request.
export const dynamic = 'force-dynamic';

/**
 * The feedback page — what the escape hatch opens (`showable-version/58`).
 *
 * A real page rather than an overlay: it survives a refresh on a plain URL, and
 * its form is a plain post with no model call anywhere in its path.
 *
 * Opening it reads nothing and writes nothing.
 */
export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale } = await params;
  // The View the escape hatch was opened from, which this page cannot observe
  // for itself. Narrowed here, and again server-side before storage.
  const { from } = await searchParams;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const session = await getCurrentSession();
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  return <FeedbackForm openedFrom={submittedFromView(from)} />;
}
