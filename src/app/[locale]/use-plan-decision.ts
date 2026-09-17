'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { commitWeeklyPlanAction, declineWeeklyPlanAction } from './weekly-actions';
import type { UiPlanProposal } from './plan-proposal-card';
import { IDLE_DECISION, cancelled, committed, received, restoredDecision } from './plan-decision';

export type { DecisionNotice } from './plan-decision';

const noop = () => {};

/**
 * The athlete's decision on a proposed week — the state and the two server
 * calls behind the Action Proposal card, owned once and hosted by both the
 * Weekly Session and Coach Chat (`training-architecture/20`; the review found
 * the handlers copied between them).
 *
 * What each outcome does to the card is decided in `plan-decision.ts`, which
 * is pure and tested; this is the React plumbing that applies it. Only the tap
 * commits (CONTEXT.md, Action Proposal): `confirm` is the write.
 */
export function usePlanDecision(params: {
  conversationId: string | null;
  initial: UiPlanProposal | null | undefined;
  /** The host's own consequence of a written week — the Weekly Session ends, the chat does not. */
  onCommitted?: () => void;
}) {
  const { conversationId, initial } = params;
  const onCommitted = params.onCommitted ?? noop;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(() => restoredDecision(initial));

  function confirm() {
    if (!conversationId) return;
    startTransition(async () => {
      const result = await commitWeeklyPlanAction(conversationId);
      setState((s) => committed(s, result));
      if (result.ok) {
        onCommitted();
        router.refresh();
      }
    });
  }

  function cancel() {
    if (!conversationId) return;
    startTransition(async () => {
      const result = await declineWeeklyPlanAction(conversationId);
      setState((s) => cancelled(s, result));
      // The calendar's "being discussed" pointer has nothing to point at now.
      if (result.ok) router.refresh();
    });
  }

  return {
    ...state,
    pending,
    /** A fresh conversation starts with nothing on the table. */
    reset: () => setState(IDLE_DECISION),
    receive: (next: UiPlanProposal | null | undefined) => setState((s) => received(s, next)),
    confirm,
    cancel,
    review: () => setState((s) => ({ ...s, popupOpen: true })),
    keepTalking: () => setState((s) => ({ ...s, popupOpen: false })),
  };
}
