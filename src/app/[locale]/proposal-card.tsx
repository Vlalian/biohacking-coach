'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useCoachOverlay } from '@/components/shell/coach-overlay-context';
import type { WeekDraft } from '@/features/coach/week-draft';
import { acceptWeekDraftAction, declineWeekDraftAction, discussWeekDraftAction } from './week-draft-actions';

/**
 * The athlete's decision on the week the Coach drafted
 * (`training-architecture/18`): accept, discuss, or leave it. A card above the
 * calendar, never a modal — the conversation and the calendar keep moving
 * whether or not the athlete answers (CONTEXT.md, Action Proposal). Only the
 * tap commits; a typed "yes" never does.
 *
 * Accept writes the whole week as drafted, including days already gone, and
 * says how many (Mads, 2026-09-15). Discuss hands the draft to a fresh Weekly
 * Session — the overlay opens on it with the same confirm/cancel card the
 * Weekly Session has always had — and the card here becomes a pointer.
 */

/** What the card is showing after a decision, or nothing yet. */
export type CardOutcome =
  | { kind: 'idle' }
  | { kind: 'accepted'; pastDays: number }
  | { kind: 'declined' }
  | { kind: 'replaced' }
  | { kind: 'consentRequired' }
  | { kind: 'error'; reason: string };

/** The line the card shows for an outcome — pure, so the copy rules are testable without a click. */
/**
 * Once decided, the buttons go: the card says what happened and the page
 * refresh replaces it. `replaced` counts — the server said the draft this card
 * shows no longer exists, and a card that kept submitting decisions against
 * that id was the stale-button bug (CodeRabbit, PR #69). A consent refusal or
 * an error is not a decision; the athlete may try again.
 */
export function isDecided(outcome: CardOutcome): boolean {
  return outcome.kind === 'accepted' || outcome.kind === 'declined' || outcome.kind === 'replaced';
}

export function outcomeKey(outcome: CardOutcome): { key: string; values?: Record<string, string | number> } | null {
  switch (outcome.kind) {
    case 'idle':
      return null;
    case 'accepted':
      return outcome.pastDays > 0 ? { key: 'acceptedPast', values: { count: outcome.pastDays } } : { key: 'accepted' };
    case 'declined':
      return { key: 'declined' };
    case 'replaced':
      return { key: 'replaced' };
    case 'consentRequired':
      return { key: 'consentRequired' };
    case 'error':
      return { key: 'error', values: { reason: outcome.reason } };
  }
}

export function ProposalCard({ draft }: { draft: WeekDraft }) {
  const t = useTranslations('ProposalCard');
  const router = useRouter();
  const { setOpen, setWeeklySeed } = useCoachOverlay();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<CardOutcome>({ kind: 'idle' });
  const decided = isDecided(outcome);

  const settle = (result: { ok: true } | { ok: false; reason: string }, onOk: () => CardOutcome) => {
    if (result.ok) {
      setOutcome(onOk());
      router.refresh();
      return;
    }
    if (result.reason === 'not-found') setOutcome({ kind: 'replaced' });
    else if (result.reason === 'consent-required') setOutcome({ kind: 'consentRequired' });
    else setOutcome({ kind: 'error', reason: result.reason });
  };

  const accept = () =>
    startTransition(async () => {
      const result = await acceptWeekDraftAction(draft.id);
      settle(result, () => ({ kind: 'accepted', pastDays: result.ok ? result.pastDays : 0 }));
    });

  const decline = () =>
    startTransition(async () => {
      settle(await declineWeekDraftAction(draft.id), () => ({ kind: 'declined' }));
    });

  const discuss = () =>
    startTransition(async () => {
      const result = await discussWeekDraftAction(draft.id);
      if (result.ok) {
        // The seed is the server's Weekly Session state; the thread opens on it.
        setWeeklySeed({
          conversationId: result.conversationId,
          weeklySessionNumber: result.weeklySessionNumber,
          messages: result.messages,
          proposal: result.proposal,
          ended: result.endedAt !== null,
        });
        setOpen(true);
        router.refresh();
        return;
      }
      settle(result, () => ({ kind: 'idle' }));
    });

  const line = outcomeKey(outcome);

  return (
    <section
      className="mb-5 rounded-lg border border-signal/40 bg-signal/5 px-5 py-4"
      data-draft-id={draft.id}
      aria-live="polite"
    >
      <h2 className="font-display text-xl tracking-[0.04em] text-foreground">{t('title')}</h2>
      <p className="mt-1 font-body text-sm text-muted-foreground">
        {t('lead', { count: draft.sessions.length, week: draft.weekStart })}
      </p>
      {!decided && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={accept}
            disabled={pending}
            data-decision="accept"
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {t('accept')}
          </button>
          <button
            type="button"
            onClick={discuss}
            disabled={pending}
            data-decision="discuss"
            className="rounded border border-border px-3 py-1 text-sm text-foreground disabled:opacity-50"
          >
            {t('discuss')}
          </button>
          <button
            type="button"
            onClick={decline}
            disabled={pending}
            data-decision="decline"
            className="rounded border border-border px-3 py-1 text-sm text-muted-foreground disabled:opacity-50"
          >
            {t('decline')}
          </button>
        </div>
      )}
      {line && <p className="mt-2 font-body text-sm text-foreground">{t(line.key, line.values)}</p>}
    </section>
  );
}
