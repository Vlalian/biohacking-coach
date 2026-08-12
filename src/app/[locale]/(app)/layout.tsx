import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ViewId } from '@/components/shell/app-shell';
import { ShellChrome } from '@/components/shell/shell-chrome';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import {
  getLatestOpenConversation,
  getMessages,
} from '@/features/coach/conversation-repository';
import { getPendingProposal } from '@/features/coach/plan-proposal-repository';
import {
  getOpenCoachChat,
  hasCoachPlanForWeek,
  shouldOfferWeeklySession,
} from '@/features/coach/coach-chat-service';
import { dateKey } from '@/lib/date';
import { CoachThread } from '../coach-thread';
import type { CoachChatInitial } from '../coach-chat';
import type { WeeklySessionInitial } from '../weekly-session';

// The Views this port has real pages for. Glossary/Roster join this list as
// their own tasks land (lovable/briefs build order) — left out for now rather
// than linking to a page that 404s.
const AVAILABLE_VIEWS: ViewId[] = [
  'training-plan',
  'information',
  'equipment',
  'settings',
  'privacy',
];

/**
 * Shared frame for every View (ADR 0007): Navigation Drawer, theme cycle, and
 * the Coach Overlay hosting the Weekly Session / Coach Chat. Guards session
 * the same way every View page already does; the heavier consent/onboarding
 * gates stay on the root page — an athlete only reaches here after passing
 * them, so re-running them per View would be redundant, not defense in depth.
 */
export default async function AppShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  const athlete = await getAthleteByUserId(session!.user.id);
  const firstName = session!.user.name.trim().split(/\s+/)[0] ?? '';

  // Restore an in-progress Weekly Session on refresh: the transcript is server
  // state, so a page reload picks it back up rather than losing it (ADR 0006).
  let weeklyInitial: WeeklySessionInitial | null = null;
  // The Coach Chat thread — the overlay's baseline mode (ADR 0007). Resumed
  // read-only: opening the overlay must never mint a conversation or call the
  // API, so a chat is created lazily on the athlete's first message.
  let chatInitial: CoachChatInitial | null = null;
  let offerWeeklySession = false;

  if (athlete) {
    const today = dateKey(new Date());
    const [open, chat, weekPlanned] = await Promise.all([
      getLatestOpenConversation(athlete.id, 'weekly_session'),
      getOpenCoachChat(athlete.id),
      hasCoachPlanForWeek(athlete.id, today),
    ]);

    if (open) {
      const transcript = await getMessages(open.id);
      // A refresh mid-decision must not lose the pending plan: restore the
      // proposal too, so the confirm/cancel popup reappears.
      const pending = await getPendingProposal(athlete.id, open.id);
      weeklyInitial = {
        conversationId: open.id,
        weeklySessionNumber: open.weeklySessionNumber ?? 1,
        messages: transcript.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          seq: m.seq,
        })),
        proposal: pending ? { sessions: pending.sessions } : null,
        ended: false,
      };
    }

    if (chat) {
      chatInitial = {
        conversationId: chat.conversationId,
        messages: chat.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          seq: m.seq,
        })),
      };
    }

    // The single sanctioned proactive nudge (ADR 0007). Weekday is resolved
    // here, server-side, in the same en-US names the Athlete Profile stores.
    offerWeeklySession = shouldOfferWeeklySession({
      weeklySessionDay: athlete.profile?.weeklySessionDay,
      todayWeekday: new Date(`${today}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }),
      hasCoachPlannedThisWeek: weekPlanned,
    });
  }

  return (
    <ShellChrome
      athleteName={session!.user.name}
      availableViews={AVAILABLE_VIEWS}
      coachContent={
        <CoachThread
          chatInitial={chatInitial}
          weeklyInitial={weeklyInitial}
          athleteFirstName={firstName}
          raceTarget={athlete?.raceTarget}
          offerWeeklySession={offerWeeklySession}
        />
      }
    >
      {children}
    </ShellChrome>
  );
}
