import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { getOpenInterview } from '@/features/feedback/feedback-service';
import { FeedbackInterview } from '../../feedback-interview';

// Read per-request: the page shows this tester's own interview, so it can never
// be prerendered. Signed out, it is not a page at all — it redirects to sign-in.
export const dynamic = 'force-dynamic';

/**
 * The Feedback Interview (`showable-version/07`) — what the escape hatch opens.
 *
 * A real page rather than an overlay, deliberately: it survives a refresh on a
 * plain URL, it needs no new overlay state machine, and its fallback textarea
 * can be a plain form with no model call anywhere in its path. That last one is
 * the load-bearing reason — a tester whose Coach is broken is the tester with
 * the most to say, so the box has to work when the conversation does not.
 *
 * Opening it reads; it never writes and never calls the model. A tester who
 * looks and leaves has not started an interview.
 */
export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  // Scoped to the signed-in account's own athlete row, so no shape of this page
  // reads another tester's interview (ADR 0006).
  const athlete = await getAthleteByUserId(session!.user.id);
  const initial = athlete ? await getOpenInterview(athlete.id) : null;

  return (
    <FeedbackInterview
      initial={
        initial
          ? {
              conversationId: initial.conversationId,
              messages: initial.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                seq: m.seq,
              })),
            }
          : null
      }
    />
  );
}
