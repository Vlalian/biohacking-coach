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
import { holdsActiveCoachingLinks } from '@/features/coach/coach-repository';
import {
  getOpenConversations,
  getMessages,
  hasHeldWeeklySessionInWeek,
} from '@/features/coach/conversation-repository';
import { getPendingProposal } from '@/features/coach/plan-proposal-repository';
import type { WeeklyOfferInput } from '@/features/coach/weekly-offer';
import { dateKey, weekStartOf } from '@/lib/date';
import { CoachThread } from '../coach-thread';
import type { CoachChatInitial } from '../coach-chat';
import type { WeeklySessionInitial } from '../weekly-session';

// The Views this port has real pages for. Glossary joins this list as its own
// task lands (lovable/briefs build order) — left out for now rather than
// linking to a page that 404s.
const ATHLETE_VIEWS: ViewId[] = [
  'training-plan',
  'information',
  'equipment',
  'settings',
  'privacy',
];

/**
 * Roster is not in that list because it is not available to everyone: CONTEXT.md
 * makes the entry conditional on the account holding active Coaching Links, so
 * it cannot be a module constant. Adding it unconditionally would show every
 * solo athlete a link to a page that tells them they are not a coach.
 *
 * It sits after the athlete's own Views rather than at the top — a Head Coach is
 * usually also an athlete (the seed creates exactly that), and their own
 * training is still what they open the app for.
 */
function availableViewsFor(isHeadCoach: boolean): ViewId[] {
  return isHeadCoach ? [...ATHLETE_VIEWS, 'roster'] : ATHLETE_VIEWS;
}

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
  const isHeadCoach = await holdsActiveCoachingLinks(session!.user.id);
  const firstName = session!.user.name.trim().split(/\s+/)[0] ?? '';

  // Restore an in-progress Weekly Session on refresh: the transcript is server
  // state, so a page reload picks it back up rather than losing it (ADR 0006).
  let weeklyInitial: WeeklySessionInitial | null = null;
  // The Coach Chat thread — the overlay's baseline mode (ADR 0007). Resumed
  // read-only: opening the overlay must never mint a conversation or call the
  // API, so a chat is created lazily on the athlete's first message.
  let chatInitial: CoachChatInitial | null = null;
  let weeklyOffer: WeeklyOfferInput | null = null;

  if (athlete) {
    const today = dateKey(new Date());
    // One query for whatever is open, across kinds — the Overlay is one surface
    // hosting several behaviors (ADR 0007), so the shell does not ask for a kind
    // by name. Both can be open at once by design: the resting Coach Chat, and
    // an in-progress Weekly Session on top of it.
    const [openConversations, heldWeeklySession] = await Promise.all([
      getOpenConversations(athlete.id),
      hasHeldWeeklySessionInWeek(athlete.id, weekStartOf(today)),
    ]);
    const open = openConversations.find((c) => c.kind === 'weekly_session') ?? null;
    const openChat = openConversations.find((c) => c.kind === 'coach_chat') ?? null;
    const chat = openChat
      ? { conversationId: openChat.id, messages: await getMessages(openChat.id) }
      : null;

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

    // The single sanctioned proactive nudge (ADR 0007) — the server supplies the
    // half it knows and stops there. Which weekday it is *for the athlete* is
    // decided in the browser: the profile stores no timezone, so resolving the
    // day here would read the server's clock, and a nudge decided at 23:30 in
    // Copenhagen would be answering for a UTC date that already rolled over.
    weeklyOffer = {
      weeklySessionDay: athlete.profile?.weeklySessionDay ?? null,
      hasHeldWeeklySessionThisWeek: heldWeeklySession,
    };
  }

  return (
    <ShellChrome
      athleteName={session!.user.name}
      availableViews={availableViewsFor(isHeadCoach)}
      coachContent={
        <CoachThread
          chatInitial={chatInitial}
          weeklyInitial={weeklyInitial}
          athleteFirstName={firstName}
          raceTarget={athlete?.raceTarget}
          weeklyOffer={weeklyOffer}
        />
      }
    >
      {children}
    </ShellChrome>
  );
}
