'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { DEFAULT_TYPE_COLOR, TYPE_COLORS } from '@/features/session/type-colors';
import { useRouter } from '@/i18n/navigation';
import { useCoachOverlay } from '@/components/shell/coach-overlay-context';
import type { DeclineReason, WeekDraft } from '@/features/coach/week-draft';
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
  /** Decline was tapped: the card asks why, once, optionally (`training-architecture/30`). */
  | { kind: 'asking' }
  | { kind: 'accepted'; pastDays: number }
  | { kind: 'declined' }
  | { kind: 'replaced' }
  | { kind: 'consentRequired' }
  | { kind: 'error'; reason: string };

/**
 * Once decided, the buttons go: the card says what happened and the page
 * refresh replaces it. `replaced` counts — the server said the draft this card
 * shows no longer exists, and a card that kept submitting decisions against
 * that id was the stale-button bug (CodeRabbit, PR #69). A consent refusal or
 * an error is not a decision; the athlete may try again. Acceptance is not a
 * decided state either: an accepted card is no card (showable-version/42).
 */
export function isDecided(outcome: CardOutcome): boolean {
  return outcome.kind === 'declined' || outcome.kind === 'replaced';
}

/** The line the card shows for an outcome — pure, so the copy rules are testable without a click. */
export function outcomeKey(outcome: CardOutcome): { key: string; values?: Record<string, string | number> } | null {
  switch (outcome.kind) {
    case 'idle':
    case 'asking':
    // No "Saved." line: the card goes, and the sessions on the calendar are
    // the confirmation (Mads, showable-version/42).
    case 'accepted':
      return null;
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

/** The four answers to "why not this week", in the order the card shows them. */
const DECLINE_CHIPS: { reason: DeclineReason; key: string }[] = [
  { reason: 'too-much', key: 'declineTooMuch' },
  { reason: 'too-little', key: 'declineTooLittle' },
  { reason: 'wrong-days', key: 'declineWrongDays' },
  { reason: 'other', key: 'declineOther' },
];

export function ProposalCard({
  draft,
  initialOutcome = { kind: 'idle' },
}: {
  draft: WeekDraft;
  /** Where the card starts. Always idle in the app; a test renders a later state without a click. */
  initialOutcome?: CardOutcome;
}) {
  const t = useTranslations('ProposalCard');
  const tWeekly = useTranslations('WeeklySession');
  const format = useFormatter();
  const router = useRouter();
  const { setOpen, setChatSeed } = useCoachOverlay();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<CardOutcome>(initialOutcome);
  const asking = outcome.kind === 'asking';
  const decided = isDecided(outcome);
  // The structure had already filled this week and the Coach adjusted it
  // (`training-architecture/40`): "drafted" would claim an empty week.
  const adjusted = draft.adjusted === true;

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

  // One tap to ask, one more to decline — with a reason or, on Skip, without.
  const decline = (reason?: DeclineReason) =>
    startTransition(async () => {
      settle(await declineWeekDraftAction(draft.id, reason), () => ({ kind: 'declined' }));
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
  // Accepted: gone at once. `router.refresh()` then confirms it server-side.
  if (outcome.kind === 'accepted') return null;
  // The card names the week it is about: two weeks can each hold a draft, and
  // two cards both titled "next week" read as the same card coming back.
  const week = format.dateTime(new Date(`${draft.weekStart}T00:00:00`), { day: 'numeric', month: 'long' });

  function sessionLine(s: WeekDraft['sessions'][number]): string {
    const day = format.dateTime(new Date(`${s.date}T00:00:00`), { weekday: 'short', day: 'numeric', month: 'short' });
    return [day, s.type, s.durationMinutes != null ? tWeekly('minutes', { count: s.durationMinutes }) : null, s.zone]
      .filter(Boolean)
      .join(' · ');
  }

  return (
    <section
      className="mb-5 border-l-4 border-signal bg-panel px-5 py-4 shadow-sm"
      data-draft-id={draft.id}
      aria-live="polite"
    >
      <h2 className="font-display text-xl font-bold uppercase italic tracking-[0.03em] text-foreground">
        {t(adjusted ? 'titleAdjusted' : 'title', { week })}
      </h2>
      <p className="mt-1 font-body text-sm text-muted-foreground">
        {t(adjusted ? 'leadAdjusted' : 'lead', { count: draft.sessions.length })}
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
              {s.note && <div className="mt-0.5 font-body text-[13px] text-muted-foreground">{s.note}</div>}
            </div>
          </li>
        ))}
      </ul>
      {asking && (
        <div className="mt-3" data-decline-question="">
          <p className="font-body text-sm text-foreground">{t('declineAsk')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DECLINE_CHIPS.map(({ reason, key }) => (
              <button
                key={reason}
                type="button"
                onClick={() => decline(reason)}
                disabled={pending}
                data-decline-reason={reason}
                className="inline-flex h-10 items-center justify-center border border-border px-4 font-body text-[15px] font-medium text-foreground transition-colors hover:border-signal hover:text-signal disabled:opacity-50"
              >
                {t(key)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => decline()}
              disabled={pending}
              data-decline-skip=""
              className="inline-flex h-10 items-center justify-center px-4 font-body text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {t('declineSkip')}
            </button>
          </div>
          <button
            type="button"
            onClick={discuss}
            disabled={pending}
            data-decision="discuss"
            className="mt-2 font-body text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-signal disabled:opacity-50"
          >
            {t('declineDiscuss')}
          </button>
        </div>
      )}
      {!decided && !asking && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={accept}
            disabled={pending}
            data-decision="accept"
            className="inline-flex h-11 items-center justify-center bg-signal px-5 font-body text-base font-semibold text-signal-foreground transition-colors hover:bg-signal/85 disabled:opacity-50"
          >
            {t('accept')}
          </button>
          <button
            type="button"
            onClick={discuss}
            disabled={pending}
            data-decision="discuss"
            className="inline-flex h-10 items-center justify-center border border-border px-4 font-body text-[15px] font-medium text-foreground transition-colors hover:border-signal hover:text-signal disabled:opacity-50"
          >
            {t('discuss')}
          </button>
          <button
            type="button"
            onClick={() => setOutcome({ kind: 'asking' })}
            disabled={pending}
            data-decision="decline"
            className="inline-flex h-10 items-center justify-center border border-border px-4 font-body text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {t('decline')}
          </button>
        </div>
      )}
      {line && <p className="mt-2 font-body text-base text-foreground">{t(line.key, line.values)}</p>}
    </section>
  );
}
