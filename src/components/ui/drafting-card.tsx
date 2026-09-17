'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Thinking } from '@/components/ui/thinking';
import { COACH_EXPECTED_SECONDS, GENERATION_POLL_LIMIT_MS, GENERATION_POLL_MS, startGenerationPoll } from '@/lib/generation';

/**
 * The card slot while the week is being drafted (`training-architecture/29`,
 * decision 9): the shell's `after()` is writing the draft this page could not
 * yet read, so the slot says so, with the rough time, and re-reads on the
 * poll until the draft lands — at which point the parent renders the real
 * card in this one's place and the poll stops with the unmount. One
 * component for both slots: the athlete's calendar and the Head Coach's plan
 * page wait on the same draft.
 *
 * Under `ui/` beside `Thinking` because the two slots live in different route
 * trees; unlike the other primitives it translates, because it is a card and
 * not a building block.
 */

export type DraftingPhase = 'drafting' | 'gave-up';

/** Pure: the line the card shows for a phase — the estimate while drafting, the not-yet line after. */
export function draftingCopy(phase: DraftingPhase, seconds: number): { key: 'drafting' | 'notYet'; values?: { seconds: number } } {
  return phase === 'drafting' ? { key: 'drafting', values: { seconds } } : { key: 'notYet' };
}

export function DraftingCard({ weekStart }: { weekStart: string }) {
  const t = useTranslations('DraftingCard');
  const router = useRouter();
  const [phase, setPhase] = useState<DraftingPhase>('drafting');

  useEffect(
    () =>
      startGenerationPoll(
        () => router.refresh(),
        () => setPhase('gave-up'),
        { intervalMs: GENERATION_POLL_MS, limitMs: GENERATION_POLL_LIMIT_MS },
      ),
    [router],
  );

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
