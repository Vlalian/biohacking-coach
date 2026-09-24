'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { useCoachOverlay } from '@/components/shell/coach-overlay-context';
import {
  localWeekday,
  shouldOfferCheckIn,
  type CheckInOfferInput,
} from '@/features/coach/weekly-offer';
import { CoachChat, type CoachChatInitial } from './coach-chat';
import { CheckInReminder } from './check-in-reminder';
import type { CheckInReport } from './check-in-step';
import { saveCheckInAction } from './weekly-actions';

/**
 * The one Coach conversation (ADR 0007, amended 2026-09-16): Coach Chat is the
 * whole thread. The Weekly Session that used to be entered from here is retired
 * (`training-architecture/21`) — the chat proposes a week when the athlete
 * wants one, and the silent draft plans it otherwise.
 *
 * What this hosts above the chat is the single sanctioned proactive nudge, now
 * the **Check-in reminder**: on the athlete's Weekly Session Day it asks for a
 * quick check-in before the week is drafted, and opens the Check-in step in
 * place. Dismissable, never blocking the chat beneath it, and skipping changes
 * nothing — a Check-in filed later is simply the freshest signal for the next
 * prompt that reads it.
 */
export function CoachThread({
  chatInitial,
  athleteFirstName,
  raceTarget,
  checkInOffer = null,
}: {
  chatInitial: CoachChatInitial | null;
  /** Header only — never sent anywhere (ADR 0006). */
  athleteFirstName?: string;
  raceTarget?: string | null;
  /** The server's half of the reminder decision: the athlete's stored day, and
   *  whether this week's Check-in is already filed. Which weekday it actually
   *  is gets decided here, in the athlete's own timezone. */
  checkInOffer?: CheckInOfferInput | null;
}) {
  const { checkInOfferDismissed, dismissCheckInOffer, chatSeed, setChatSeed } = useCoachOverlay();

  // Decided on the client only. The server and the browser can disagree about
  // what day it is — no timezone is stored on the profile — so answering this
  // server-side would nudge on the wrong local day near midnight *and* mismatch
  // on hydration. `false` is the server snapshot, so the first paint matches and
  // the reminder appears a beat later: right for a reminder, wrong for a gate.
  // Same mounted-detection shape `settings-view.tsx` uses for its theme tiles.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const offerCheckIn =
    mounted && checkInOffer
      ? shouldOfferCheckIn({
          weeklySessionDay: checkInOffer.weeklySessionDay,
          todayWeekday: localWeekday(new Date()),
          hasCheckedInThisWeek: checkInOffer.hasCheckedInThisWeek,
        })
      : false;

  // The reminder's two states: the banner asking, and the Check-in step it
  // opens. Both are answered by dismissing the offer — filing, skipping and
  // "not now" all end it for the week; the server's "already filed" answer
  // keeps it ended across reloads.
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInPending, startCheckIn] = useTransition();
  const [checkInFailed, setCheckInFailed] = useState(false);

  function fileCheckIn(report: CheckInReport) {
    setCheckInFailed(false);
    startCheckIn(async () => {
      // The action rethrows anything that is not the athlete's fault (a
      // database error, say). Left uncaught, that reaches the locale error
      // boundary, which replaces this form - and the answers held in its local
      // state - with a retry screen. The athlete keeps their answers and gets
      // the notice instead.
      try {
        const result = await saveCheckInAction(report);
        if (result.ok) dismissCheckInOffer();
        else setCheckInFailed(true);
      } catch {
        setCheckInFailed(true);
      }
    });
  }

  // A Coach Chat seeded from the calendar ("Discuss with the Coach" on a
  // drafted week, `training-architecture/18`, into the one conversation since
  // `/20`): React's documented "adjusting state when a prop changes" pattern,
  // during render rather than in an effect, so it lands in the same pass. The
  // seed's conversation id is the CoachChat's key, so a chat already showing is
  // replaced rather than left holding stale state — the seed carries the
  // proposal the restored one did not.
  // The seed is a transfer, not a home. The thread copies it into its own
  // state the moment it sees it and clears the shared one right then, so
  // closing the overlay any way at all — cancel and close, not only a later
  // send — cannot leave a withdrawn plan waiting for the next open
  // (CodeRabbit, PR #69). Adopted during render; the clear is a parent-state
  // set the same way.
  const [adopted, setAdopted] = useState<(CoachChatInitial & { seededAt: number }) | null>(null);
  // Guarded on the handoff time, not the id: Discuss reuses the open chat, so a
  // second handoff into the same conversation must still be adopted — and a
  // render-time set with no guard loops.
  if (chatSeed && chatSeed.seededAt !== adopted?.seededAt) {
    setAdopted(chatSeed as CoachChatInitial & { seededAt: number });
    setChatSeed(null);
  }
  const chatStart = adopted ?? chatInitial;
  // The chat remounts on every handoff, so its state is read fresh from the
  // seed — the proposal included — even when the overlay sat open on that chat.
  const chatKey = adopted ? `${adopted.conversationId}:${adopted.seededAt}` : (chatInitial?.conversationId ?? 'fresh');

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* One title only: the panel's own bar names Momentum (Mads, 2026-09-24).
          What stays here is who the thread is for and what they train toward. */}
      {athleteFirstName && (
        <header className="shrink-0 border-b border-border px-5 py-2.5">
          <p className="font-body text-sm uppercase tracking-[0.16em] text-muted-foreground">
            {athleteFirstName}
            {raceTarget && <span className="text-signal"> · {raceTarget}</span>}
          </p>
        </header>
      )}

      {offerCheckIn && !checkInOfferDismissed && (
        <CheckInReminder
          open={checkInOpen}
          pending={checkInPending}
          failed={checkInFailed}
          onOpen={() => setCheckInOpen(true)}
          onSkip={dismissCheckInOffer}
          onSubmit={fileCheckIn}
        />
      )}

      <div className="min-h-0 flex-1">
        <CoachChat key={chatKey} initial={chatStart} />
      </div>
    </div>
  );
}
