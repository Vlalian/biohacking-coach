'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Thinking } from '@/components/ui/thinking';
import { COACH_EXPECTED_SECONDS, GENERATION_POLL_LIMIT_MS, GENERATION_POLL_MS, startGenerationPoll } from '@/lib/generation';
import { draftLandedAction } from './week-draft-actions';
import { coachDraftLandedAction } from './(app)/coach/athlete/[athleteId]/week-draft-actions';

/**
 * The card slot while the week is being drafted (`training-architecture/29`,
 * decision 9): the shell's `after()` is writing the draft this page could not
 * yet read, so the slot says so, with the rough time, and asks on the poll
 * whether it has landed — then refreshes the page once, at which point the
 * parent renders the real card in this one's place and the poll stops with
 * the unmount. One component for both slots: the athlete's calendar and the
 * Head Coach's plan page wait on the same draft, and `waiter` says which read
 * to poll.
 *
 * The poll is a *read*, never a refresh. The batch review (2026-09-17) found
 * the first version refreshing the page every tick, which re-rendered the
 * shell, whose `after()` started the very draft being waited on again.
 */

export type DraftingPhase = 'drafting' | 'gave-up';

/** Who is waiting: the athlete for their own week, or the Head Coach for a linked athlete's. */
export type Waiter = { side: 'athlete' } | { side: 'coach'; athleteId: string };

/** Pure: the line the card shows for a phase — the estimate while drafting, the not-yet line after. */
export function draftingCopy(phase: DraftingPhase, seconds: number): { key: 'drafting' | 'notYet'; values?: { seconds: number } } {
  return phase === 'drafting' ? { key: 'drafting', values: { seconds } } : { key: 'notYet' };
}

/** The read the poll asks, for the waiter: each is a server action that answers "landed?" and changes nothing. */
export function landedProbe(waiter: Waiter, weekStart: string): () => Promise<boolean> {
  return waiter.side === 'athlete'
    ? () => draftLandedAction(weekStart)
    : () => coachDraftLandedAction(waiter.athleteId, weekStart);
}

export function DraftingCard({ weekStart, waiter }: { weekStart: string; waiter: Waiter }) {
  const t = useTranslations('DraftingCard');
  const router = useRouter();
  const [phase, setPhase] = useState<DraftingPhase>('drafting');

  useEffect(() => {
    const probe = landedProbe(waiter, weekStart);
    return startGenerationPoll(
      async () => {
        const landed = await probe();
        // Once: the refreshed page renders the real card here, and this one unmounts.
        if (landed) router.refresh();
        return landed;
      },
      () => setPhase('gave-up'),
      { intervalMs: GENERATION_POLL_MS, limitMs: GENERATION_POLL_LIMIT_MS },
    );
    // `waiter` is an object literal at both call sites; its parts are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, weekStart, waiter.side, waiter.side === 'coach' ? waiter.athleteId : null]);

  const line = draftingCopy(phase, COACH_EXPECTED_SECONDS);

  return (
    <section
      className="mb-5 rounded-lg border border-dashed border-signal/40 bg-signal/5 px-5 py-4"
      data-drafting-card={weekStart}
      aria-live="polite"
    >
      {phase === 'drafting' ? (
        <Thinking label={t(line.key, line.values)} />
      ) : (
        <p className="font-body text-sm text-muted-foreground" role="status">
          {t(line.key)}
        </p>
      )}
    </section>
  );
}
