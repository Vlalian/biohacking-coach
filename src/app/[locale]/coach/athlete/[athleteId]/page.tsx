import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getCoachByUserId } from '@/features/coach/coach-repository';
import { getLatestBriefingWithMessages } from '@/features/coach/conversation-repository';
import { getCoachAthleteView } from '@/features/coach/roster-service';
import { parseLayout } from '@/features/information-view/layout';
import { PANEL_IDS } from '@/features/information-view/panels';
import { dateKey } from '@/lib/date';
import { Calendar } from '@/app/[locale]/calendar';
import { InformationView } from '@/app/[locale]/(app)/information/information-view';
import { Briefing } from './briefing';
import { PrescribePanel } from './prescribe-panel';
import { SharedConversations } from './shared-conversations';
import { saveCoachLayoutAction } from './coach-layout-actions';

// Per-request: the page depends on the signed-in coach and the requested
// athlete, and it must never be prerendered or cached across coaches.
export const dynamic = 'force-dynamic';

export default async function CoachAthletePage({
  params,
}: {
  params: Promise<{ locale: string; athleteId: string }>;
}) {
  const { locale, athleteId } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  const t = await getTranslations('Roster');
  const coach = await getCoachByUserId(session!.user.id);
  if (!coach) {
    return (
      <main className="flex min-h-screen flex-col items-center gap-6 p-8">
        <p className="text-neutral-500">{t('notACoach')}</p>
      </main>
    );
  }

  // The one gate: the service returns null unless an active Coaching Link joins
  // this coach to this athlete. A forged athlete id lands here and is refused —
  // the refusal is a 404, indistinguishable from an athlete that does not exist,
  // so it leaks nothing about who is on other coaches' rosters.
  const view = await getCoachAthleteView(coach.id, athleteId, dateKey(new Date()));
  if (!view) {
    notFound();
  }

  // The coach's ONE roster-wide layout (ADR 0004). Edits persist to the coach
  // row, not the athlete's — the save action resolves the coach from the
  // session, so favorites the coach sets here follow them across the roster.
  const layout = parseLayout(coach.informationViewLayout, PANEL_IDS);

  // The coach's most recent briefing about this athlete, restored so it survives
  // a refresh (ADR 0006 — the transcript is server-side, not browser state). The
  // conversation's own material is gated by Link Visibility when it is (re)built;
  // this only carries the persisted turns.
  const briefing = await getLatestBriefingWithMessages(coach.id, athleteId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center gap-6 p-8">
      <header className="flex w-full flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold">{view.athleteName}</h1>
        <Link href="/coach" className="text-sm text-blue-500 underline">
          {t('backToRoster')}
        </Link>
      </header>

      <Calendar
        sessions={view.calendarSessions}
        unavailableDates={view.unavailableDates}
        todayKey={dateKey(new Date())}
        readOnly
      />
      <PrescribePanel athleteId={athleteId} planSessions={view.planSessions} />
      <InformationView
        dataset={view.dataset}
        initialLayout={layout}
        saveLayout={saveCoachLayoutAction}
      />
      {/* Shown only when share_ai_transcripts is on — the service returns null
          otherwise, so nothing was ever fetched to withhold. */}
      {view.sharedTranscripts && (
        <SharedConversations transcripts={view.sharedTranscripts} />
      )}
      <Briefing
        athleteId={athleteId}
        initial={
          briefing
            ? {
                conversationId: briefing.conversation.id,
                messages: briefing.messages.map((m) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  seq: m.seq,
                })),
              }
            : null
        }
      />
    </main>
  );
}
