import { getRatingsForConversation } from '@/features/feedback/message-feedback-repository';
import { hasLocale } from 'next-intl';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
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
import { selectOpenConversations } from '@/features/coach/conversation';
import { getPendingProposal } from '@/features/coach/plan-proposal-repository';
import { narratePendingEvents } from '@/features/coach/narration-service';
import { getCoachChores } from '@/features/coach/coach-chores-service';
import type { CoachChore } from '@/features/coach/coach-chores';
import { logCoachChoresFailure, logNarrationFailure, logWeekDraftFailure } from '@/lib/coach-log';
import { CoachChoresDialog } from './coach-chores-dialog';
import { ensureRosterDrafted, ensureWeekDrafted } from '@/features/coach/week-draft-service';
import type { WeeklyOfferInput } from '@/features/coach/weekly-offer';
import { weekStartOf, today } from '@/lib/date';
import { CoachThread } from '../coach-thread';
import type { CoachChatInitial } from '../coach-chat';
import { chatStateOf } from '@/features/coach/coach-chat-service';
import type { WeeklySessionInitial } from '../weekly-session';

// The Views this port has real pages for — a View is listed here only once
// its page exists, never ahead of it, so the drawer cannot link to a 404.
const ATHLETE_VIEWS: ViewId[] = [
  'training-plan',
  'information',
  'equipment',
  'glossary',
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
    const todayKey = today();

    // Narration runs *before* the transcript is read, so anything the Head
    // Coach did while the athlete was away is already in the thread this render
    // hands to the Coach Overlay — rather than appearing only on the next
    // navigation (ADR 0003, "no silent plan mutations"; `coached-mode/03`).
    //
    // App-open is the trigger, not the Weekly Session: that is offered and
    // never forced (ADR 0007), so hanging narration off it would let an athlete
    // who dismisses the offer never learn their plan changed.
    //
    // A write on a render path is deliberate and is safe by construction: with
    // nothing pending — the overwhelmingly common case — this is one indexed
    // read and no write at all, and when there is something, the stamp and the
    // message land in one batch that re-asserts `narrated_at IS NULL`, so two
    // concurrent renders cannot narrate the same change twice. It never calls
    // the Anthropic API.
    //
    // It is guarded, though, because *safe* is not the same as *infallible*: a
    // transient database failure here would otherwise reject the render and
    // take down the whole app shell for that athlete. Narration is not lost by
    // catching — nothing was stamped, so it stays pending and is narrated on
    // the next app-open. A missed narration retries; a thrown render does not.
    const narrationCopy = await getTranslations('Narration');
    const weekdayOf = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    try {
      await narratePendingEvents(
        athlete.id,
        (key, values) => narrationCopy(key, values),
        (key) => weekdayOf.format(new Date(`${key}T12:00:00Z`)),
      );
    } catch (error) {
      logNarrationFailure(athlete.id, error);
    }

    // One query for whatever is open, across kinds — the Overlay is one surface
    // hosting several behaviors (ADR 0007) — and then an explicit selection by
    // name. The query is generic; the *restore* is not, and must not be: a
    // `feedback` interview is open too, and belongs nowhere near the Overlay
    // (`selectOpenConversations`).
    const [openConversations, heldWeeklySession] = await Promise.all([
      getOpenConversations(athlete.id),
      hasHeldWeeklySessionInWeek(athlete.id, weekStartOf(todayKey)),
    ]);
    const { weeklySession: open, coachChat: openChat } =
      selectOpenConversations(openConversations);
    // The transcript and the week awaiting a decision, if the chat holds one —
    // a refresh mid-decision must not lose the card (`training-architecture/20`).
    const chat = openChat ? await chatStateOf(athlete.id, openChat.id) : null;
    // The tester's own thumbs, restored with the transcript so a flag left last
    // week is still there on load (`showable-version/05`, item 3). Read here
    // rather than per row: one query for the thread, not one per message.
    const chatRatings = chat
      ? await getRatingsForConversation(athlete.id, chat.conversationId)
      : {};

    if (open) {
      const transcript = await getMessages(open.id);
      // A refresh mid-decision must not lose the pending plan: restore the
      // proposal too, so the confirm/cancel popup reappears.
      const pending = await getPendingProposal(athlete.id, open.id);
      const weeklyRatings = await getRatingsForConversation(athlete.id, open.id);
      weeklyInitial = {
        conversationId: open.id,
        weeklySessionNumber: open.weeklySessionNumber ?? 1,
        messages: transcript.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          seq: m.seq,
          citations: m.citations,
          rating: weeklyRatings[m.id] ?? null,
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
          citations: m.citations,
          rating: chatRatings[m.id] ?? null,
        })),
        proposal: chat.proposal,
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

    // The silent week draft (`training-architecture/16`) runs here, **after the
    // response is sent** — the shell renders now, the ~20 s Coach call happens
    // once the athlete has their screen, and the next navigation shows the
    // proposal with the narration firing from this same layout. Cheap on the
    // common path (a handful of reads, then nothing), never on a render path,
    // never thrown.
    const athleteId = athlete.id;
    after(async () => {
      try {
        await ensureWeekDrafted(athleteId, todayKey);
      } catch (error) {
        logWeekDraftFailure(athleteId, error);
      }
    });
  }

  // The Head Coach's chores (`training-architecture/19`): a stale block set on
  // their Roster is repaired from a dialog before the page, in one click. Read
  // **here, on the render path**, not in the `after()` below — a popup that
  // arrives a page late is the Briefing line the ticket refuses. One query,
  // only for an account holding links; zero rows is the common case. Guarded
  // like narration: a driver failure costs the coach the popup on this open,
  // never the shell.
  let chores: CoachChore[] = [];
  if (isHeadCoach) {
    try {
      chores = await getCoachChores(session!.user.id);
    } catch (error) {
      logCoachChoresFailure(session!.user.id, error);
    }
  }

  // The same trigger for a Head Coach's own open, one draft per athlete on
  // their Roster (`/17`): the coach sees the draft a day before the athlete,
  // and on that day the athlete has no reason to open the app — so the coach's
  // open has to be what drafts it. Outside the athlete branch on purpose: a
  // coach need not be an athlete. The service never throws; the catch is for
  // whatever is outside it.
  if (isHeadCoach) {
    const coachUserId = session!.user.id;
    after(async () => {
      try {
        await ensureRosterDrafted(coachUserId, today());
      } catch (error) {
        // The log line's id field names an athlete; the roster fan-out has none
        // to name at this level, and a user id is not an athlete id.
        logWeekDraftFailure('roster', error);
      }
    });
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
      {chores.length > 0 ? <CoachChoresDialog chores={chores} /> : null}
      {children}
    </ShellChrome>
  );
}
