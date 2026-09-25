import { getRatingsForConversation } from '@/features/feedback/message-feedback-repository';
import { hasLocale } from 'next-intl';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import type { ViewId } from '@/components/shell/app-shell';
import { ShellChrome } from '@/components/shell/shell-chrome';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { timed } from '@/lib/render-timing';
import { getCurrentAthlete, getCurrentSession } from './current-user';
import { holdsActiveCoachingLinks } from '@/features/coach/coach-repository';
import { getOpenConversations } from '@/features/coach/conversation-repository';
import { selectOpenConversations } from '@/features/coach/conversation';
import { getCheckInForWeek } from '@/features/coach/check-in-repository';
import { narratePendingEvents } from '@/features/coach/narration-service';
import { getCoachChores } from '@/features/coach/coach-chores-service';
import type { CoachChore } from '@/features/coach/coach-chores';
import { logCoachChoresFailure, logCoachFailure, logNarrationFailure, logWeekDraftFailure } from '@/lib/coach-log';
import { CoachChoresDialog } from './coach-chores-dialog';
import { ensureRosterDrafted, ensureWeekDrafted } from '@/features/coach/week-draft-service';
import { ensureBlockFilled } from '@/features/coach/block-fill-service';
import type { CheckInOfferInput } from '@/features/coach/weekly-offer';
import { weekStartOf, today } from '@/lib/date';
import { CoachThread } from '../coach-thread';
import type { CoachChatInitial } from '../coach-chat';
import { chatStateOf } from '@/features/coach/coach-chat-service';

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
 * the Coach Overlay hosting Coach Chat. Guards session
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

  const session = await getCurrentSession();
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  // Neither read waits for the other (`code-health/09`). The athlete read is
  // the cached one the page under this layout reuses, so it costs the render
  // one round trip, not two.
  const [athlete, isHeadCoach] = await timed('shell.reads', () =>
    Promise.all([getCurrentAthlete(), holdsActiveCoachingLinks(session!.user.id)]),
  );
  const firstName = session!.user.name.trim().split(/\s+/)[0] ?? '';

  // The Coach Chat thread — the one conversation (ADR 0007). Resumed
  // read-only: opening the overlay must never mint a conversation or call the
  // API, so a chat is created lazily on the athlete's first message.
  let chatInitial: CoachChatInitial | null = null;
  let checkInOffer: CheckInOfferInput | null = null;

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
      await timed('shell.narration', () =>
        narratePendingEvents(
          athlete.id,
          (key, values) => narrationCopy(key, values),
          (key) => weekdayOf.format(new Date(`${key}T12:00:00Z`)),
        ),
      );
    } catch (error) {
      logNarrationFailure(athlete.id, error);
    }

    // One query for whatever is open, across kinds, and then an explicit
    // selection by name. The query is generic; the *restore* is not, and must
    // not be: a `feedback` interview is open too, and belongs nowhere near the
    // Overlay (`selectOpenConversations`). An old open `weekly_session` is
    // not restored either — the behavior is retired (`training-architecture/21`)
    // and there is no screen for it; its transcript still renders for a Head
    // Coach through the shared-transcript reader.
    const [openConversations, thisWeeksCheckIn] = await timed('shell.thread', () =>
      Promise.all([
        getOpenConversations(athlete.id),
        getCheckInForWeek(athlete.id, weekStartOf(todayKey)),
      ]),
    );
    const { coachChat: openChat } = selectOpenConversations(openConversations);
    // The transcript and the week awaiting a decision, if the chat holds one —
    // a refresh mid-decision must not lose the card (`training-architecture/20`).
    const chat = openChat ? await chatStateOf(athlete.id, openChat.id) : null;
    // The tester's own thumbs, restored with the transcript so a flag left last
    // week is still there on load (`showable-version/05`, item 3). Read here
    // rather than per row: one query for the thread, not one per message.
    const chatRatings = chat
      ? await getRatingsForConversation(athlete.id, chat.conversationId)
      : {};

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

    // The single sanctioned proactive nudge (ADR 0007), now the Check-in
    // reminder — the server supplies the half it knows and stops there. Which
    // weekday it is *for the athlete* is decided in the browser: the profile
    // stores no timezone, so resolving the day here would read the server's
    // clock, and a nudge decided at 23:30 in Copenhagen would be answering for
    // a UTC date that already rolled over.
    checkInOffer = {
      weeklySessionDay: athlete.profile?.weeklySessionDay ?? null,
      hasCheckedInThisWeek: thisWeeksCheckIn !== null,
    };

    // The silent week draft (`training-architecture/16`) runs here, **after the
    // response is sent** — the shell renders now, the ~20 s Coach call happens
    // once the athlete has their screen, and the next navigation shows the
    // proposal with the narration firing from this same layout. Cheap on the
    // common path (a handful of reads, then nothing), never on a render path,
    // never thrown.
    const athleteId = athlete.id;
    after(async () => {
      // The structure first (`training-architecture/34`): the block's weeks
      // are filled before the Coach drafts, so the draft adjusts what the
      // athlete can already see rather than writing into an empty week. Its
      // own failure costs the draft nothing.
      // `ensureBlockFilled` files its own failures and returns an outcome
      // rather than throwing, so this catch should never fire. It stays
      // because the two triggers are isolated from each other here: a dead
      // driver in the fill must not cost the athlete the week's draft. Under
      // its own surface — a block fill filed as a week draft would send
      // whoever reads the logs to the wrong module.
      await ensureBlockFilled(athleteId, todayKey).catch((error: unknown) => {
        logCoachFailure({ surface: 'block_fill', athleteId, conversationId: null, error });
      });
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
          athleteFirstName={firstName}
          raceTarget={athlete?.raceTarget}
          checkInOffer={checkInOffer}
        />
      }
    >
      {chores.length > 0 ? <CoachChoresDialog chores={chores} /> : null}
      {children}
    </ShellChrome>
  );
}
