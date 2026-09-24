'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { redraftWeekAction } from './week-draft-actions';
import { COACH_EXPECTED_SECONDS } from '@/lib/generation';

/**
 * The one way a week is drafted twice (`training-architecture/24`, Mads
 * 2026-09-17): the athlete declined the Coach's draft, the week holds no plan,
 * and they ask once more. A card in the proposal card's place above the
 * calendar, never a modal (ADR 0007). One button; the draft that follows shows
 * as the ordinary proposal card on the next render.
 *
 * The "drafting" line quotes the shared estimate (`training-architecture/29`):
 * the Coach call runs behind the awaited action, so the card says so and
 * refreshes when the action returns — nothing to poll.
 */

/** Why the action said no — the action's own union, so a new refusal in the service is a type error here, not a silent fall to `error`. */
export type RedraftReason = Extract<Awaited<ReturnType<typeof redraftWeekAction>>, { ok: false }>['reason'];

export type RedraftOutcome =
  | { kind: 'idle' }
  | { kind: 'drafting' }
  | { kind: 'refused'; reason: RedraftReason };

/** The line the card shows for an outcome — pure, so the copy rules are testable without a click. */
export function redraftOutcomeKey(outcome: RedraftOutcome): { key: string; values?: Record<string, string | number> } | null {
  switch (outcome.kind) {
    case 'idle':
      return null;
    case 'drafting':
      return { key: 'drafting', values: { seconds: COACH_EXPECTED_SECONDS } };
    case 'refused':
      return refusalKey(outcome.reason);
  }
}

/** The refusals with a line of their own; the rest (a failed or malformed Coach call, a lost race) share the generic one. */
const REFUSAL_KEYS: Partial<Record<RedraftReason, string>> = {
  'already-planned': 'alreadyPlanned',
  'draft-pending': 'draftPending',
  'not-declined': 'notDeclined',
  'no-window': 'noWindow',
  'consent-required': 'consentRequired',
};

function refusalKey(reason: RedraftReason): { key: string; values?: Record<string, string> } {
  const key = REFUSAL_KEYS[reason];
  return key ? { key } : { key: 'error', values: { reason } };
}

export function RedraftCard({ weekStart }: { weekStart: string }) {
  const t = useTranslations('RedraftCard');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<RedraftOutcome>({ kind: 'idle' });

  const redraft = () =>
    startTransition(async () => {
      setOutcome({ kind: 'idle' });
      // A server action can reject outright (a dead driver, a network blip),
      // not only resolve to { ok: false }; without the catch the card would
      // sit on "drafting" with its button gone (CodeRabbit, PR #78).
      const result = await redraftWeekAction(weekStart).catch(() => ({ ok: false as const, reason: 'coach-failed' as const }));
      if (result.ok) {
        // The new draft's card takes this card's place.
        router.refresh();
        return;
      }
      setOutcome({ kind: 'refused', reason: result.reason });
    });

  // The drafting line follows the transition's own `pending`, not a state
  // set inside it: React 19 holds every update made inside an async
  // transition until the action resolves, so a "drafting" outcome set there
  // never showed — the card sat silent for the whole Coach call (Mads's
  // smoke run of PR #78, S17).
  const line = redraftOutcomeKey(pending ? { kind: 'drafting' } : outcome);

  return (
    <section
      className="mb-5 border border-dashed border-signal/60 border-l-4 border-l-signal bg-panel px-5 py-4"
      data-redraft-card={weekStart}
      aria-live="polite"
    >
      <h2 className="font-display text-xl font-bold uppercase italic tracking-[0.03em] text-foreground">{t('title')}</h2>
      <p className="mt-1 font-body text-sm text-muted-foreground">{t('lead', { week: weekStart })}</p>
      {!pending && (
        <div className="mt-3">
          <button
            type="button"
            onClick={redraft}
            disabled={pending}
            data-action="redraft"
            className="inline-flex h-11 items-center justify-center bg-signal px-5 font-body text-base font-semibold text-signal-foreground transition-colors hover:bg-signal/85 disabled:opacity-50"
          >
            {t('redraft')}
          </button>
        </div>
      )}
      {line && <p className="mt-2 font-body text-sm text-foreground">{t(line.key, line.values)}</p>}
    </section>
  );
}
