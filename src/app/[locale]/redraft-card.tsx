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

export type RedraftOutcome =
  | { kind: 'idle' }
  | { kind: 'drafting' }
  | { kind: 'refused'; reason: string };

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

const REFUSAL_KEYS: Record<string, string> = {
  'already-planned': 'alreadyPlanned',
  'draft-pending': 'draftPending',
  'not-declined': 'notDeclined',
  'no-window': 'noWindow',
  'consent-required': 'consentRequired',
};

function refusalKey(reason: string): { key: string; values?: Record<string, string> } {
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
      setOutcome({ kind: 'drafting' });
      const result = await redraftWeekAction(weekStart);
      if (result.ok) {
        // The new draft's card takes this card's place.
        router.refresh();
        return;
      }
      setOutcome({ kind: 'refused', reason: result.reason });
    });

  const line = redraftOutcomeKey(outcome);

  return (
    <section
      className="mb-5 rounded-lg border border-dashed border-signal/40 bg-signal/5 px-5 py-4"
      data-redraft-card={weekStart}
      aria-live="polite"
    >
      <h2 className="font-display text-xl tracking-[0.04em] text-foreground">{t('title')}</h2>
      <p className="mt-1 font-body text-sm text-muted-foreground">{t('lead', { week: weekStart })}</p>
      {outcome.kind !== 'drafting' && (
        <div className="mt-3">
          <button
            type="button"
            onClick={redraft}
            disabled={pending}
            data-action="redraft"
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {t('redraft')}
          </button>
        </div>
      )}
      {line && <p className="mt-2 font-body text-sm text-foreground">{t(line.key, line.values)}</p>}
    </section>
  );
}
