'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { DEFAULT_TYPE_COLOR, TYPE_COLORS } from '@/features/session/type-colors';
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
 * says how many (Mads, 2026-09-15). Discuss hands the draft to the athlete's
 * Coach Chat (`/20`) — the overlay opens on it with the same confirm/cancel
 * card — and the card here becomes a pointer.
 *
 * The sessions are listed on the card (grill on the PR #71 smoke run,
 * 2026-09-17, decision 7): it said only "5 sessions for the week of …" and the
 * ghosts in the calendar could not be opened, so the athlete accepted a week
 * they could not read. The card is the proposal. Same line as the chat's
 * popup: day · type · minutes · zone, note under.
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
  const tWeekly = useTranslations('WeeklySession');
  const format = useFormatter();
  const router = useRouter();
  const { setOpen, setChatSeed } = useCoachOverlay();
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
        // The seed is the server's Coach Chat state with the draft as its
        // pending proposal; the thread opens in chat on it (`/20`).
        setChatSeed({
          conversationId: result.conversationId,
          messages: result.messages,
          proposal: result.proposal,
          seededAt: Date.now(),
        });
        setOpen(true);
        router.refresh();
        return;
      }
      settle(result, () => ({ kind: 'idle' }));
    });

  const line = outcomeKey(outcome);

  function sessionLine(s: WeekDraft['sessions'][number]): string {
    const day = format.dateTime(new Date(`${s.date}T00:00:00`), { weekday: 'short', day: 'numeric', month: 'short' });
    return [day, s.type, s.durationMinutes != null ? tWeekly('minutes', { count: s.durationMinutes }) : null, s.zone]
      .filter(Boolean)
      .join(' · ');
  }

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
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {draft.sessions.map((s, i) => (
          <li key={`${s.date}-${i}`} className="flex gap-3 py-2" data-session={s.date}>
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[s.type] ?? DEFAULT_TYPE_COLOR }}
            />
            <div className="min-w-0 flex-1">
              <div className="font-body text-sm text-foreground">{sessionLine(s)}</div>
              {s.note && <div className="mt-0.5 font-body text-xs text-muted-foreground">{s.note}</div>}
            </div>
          </li>
        ))}
      </ul>
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
