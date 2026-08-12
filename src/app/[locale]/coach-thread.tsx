'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { useCoachOverlay } from '@/components/shell/coach-overlay-context';
import { CoachChat, type CoachChatInitial } from './coach-chat';
import { WeeklySession, type WeeklySessionInitial } from './weekly-session';

/**
 * The one Coach conversation (ADR 0007): "Coach Chat, the Weekly Session,
 * Session Negotiation, and the Reflective Prompt become *behaviors inside that
 * one thread*, not destinations."
 *
 * So this is a mode switch inside a single surface, not a router. Coach Chat is
 * the **baseline** — what the Coach is doing whenever it isn't running a
 * structured behavior — and the Weekly Session is entered from within it and
 * returns to it.
 *
 * The Weekly Session is **offered, never forced** (ADR 0007). Two ways in:
 * the athlete's own action in the header, always available; and the single
 * sanctioned proactive nudge on their Weekly Session Day, which is dismissable
 * and never blocks the chat beneath it. An in-progress Weekly Session restored
 * from the server opens directly in weekly mode — the athlete was mid-decision,
 * so dropping them into chat would lose their place.
 */
export function CoachThread({
  chatInitial,
  weeklyInitial,
  athleteFirstName,
  raceTarget,
  offerWeeklySession = false,
}: {
  chatInitial: CoachChatInitial | null;
  weeklyInitial: WeeklySessionInitial | null;
  /** Header only — never sent anywhere (ADR 0006). */
  athleteFirstName?: string;
  raceTarget?: string | null;
  /** True only on the athlete's Weekly Session Day with the week still unplanned. */
  offerWeeklySession?: boolean;
}) {
  const t = useTranslations('CoachThread');
  const { reference, weeklyOfferDismissed, dismissWeeklyOffer } = useCoachOverlay();

  // Mode on mount. The Reference wins over a restored Weekly Session: the
  // overlay is unmounted while closed, so "Discuss with Coach" *mounts* this
  // component with a Reference already set — there is no transition to react
  // to. Missing that was a real bug: with a Weekly Session open, the overlay
  // reopened in weekly mode and the chip was unreachable (caught in a fresh tab;
  // a warm one hid it, because the component was already mounted in chat).
  const [mode, setMode] = useState<'chat' | 'weekly'>(
    reference ? 'chat' : weeklyInitial ? 'weekly' : 'chat',
  );

  // And the same rule while already mounted: a *new* Reference arriving (the
  // athlete tapped a different session without closing the overlay) drops the
  // thread back to chat. Adjusted during render rather than in an effect —
  // React's documented "adjusting state when a prop changes" pattern — so the
  // switch lands in the same pass instead of a second one.
  const referenceId = reference?.sessionId ?? null;
  const [seenReferenceId, setSeenReferenceId] = useState(referenceId);
  if (referenceId !== seenReferenceId) {
    setSeenReferenceId(referenceId);
    if (referenceId) setMode('chat');
  }

  if (mode === 'weekly') {
    return (
      <WeeklySession
        initial={weeklyInitial}
        athleteFirstName={athleteFirstName}
        raceTarget={raceTarget}
        onExit={() => setMode('chat')}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border px-5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-2xl leading-none tracking-[0.04em] text-foreground">
            {t('title')}
          </span>
          {athleteFirstName && (
            <div className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <div>{athleteFirstName}</div>
              {raceTarget && <div className="text-signal">{raceTarget}</div>}
            </div>
          )}
        </div>
        {/* Always reachable, never demanded — the athlete can plan whenever they
            like, independent of the once-a-week offer below. */}
        <button
          type="button"
          onClick={() => setMode('weekly')}
          className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-signal"
        >
          <CalendarDays className="h-3 w-3" />
          {t('planWeek')}
        </button>
      </header>

      {offerWeeklySession && !weeklyOfferDismissed && (
        <div className="shrink-0 border-b border-signal/40 bg-signal/5 px-4 py-3">
          <p className="text-sm leading-relaxed text-foreground">{t('offerBody')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode('weekly')}
              className="bg-signal px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal-foreground transition-opacity hover:opacity-90"
            >
              {t('offerAccept')}
            </button>
            <button
              type="button"
              onClick={dismissWeeklyOffer}
              className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('offerDismiss')}
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <CoachChat initial={chatInitial} />
      </div>
    </div>
  );
}
