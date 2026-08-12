'use client';

import { createContext, useContext } from 'react';

/**
 * The domain object the athlete brought into the Coach Overlay — CONTEXT.md's
 * **Reference**: "a chip inside a message pointing at the domain object the
 * conversation is about".
 *
 * Deliberately just an id plus a display label: "bounded to 'which session',
 * never pixel position" (CONTEXT.md, Coach Overlay). The server re-resolves the
 * id against the signed-in athlete before it reaches a prompt, so the label is
 * for the athlete's eyes and the id is a claim to be checked — never trusted
 * as passed (ADR 0006).
 */
export interface CoachReference {
  sessionId: string;
  /** Human-readable, already localised by whoever set it. */
  label: string;
}

/**
 * Lets any View reach the Coach Overlay that shell-chrome.tsx owns — "Discuss
 * with Coach" on a Session Drawer, for instance, is several component layers
 * below the shell. Carries whether the overlay is shown, and the Reference the
 * athlete opened it with; no Coach content flows through here.
 */
export const CoachOverlayContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  reference: CoachReference | null;
  setReference: (reference: CoachReference | null) => void;
  /**
   * Whether the athlete has waved off this week's Weekly Session offer.
   *
   * Lives here, above the overlay, on purpose: the overlay unmounts when
   * closed, so holding this inside it made the "single sanctioned nudge"
   * (ADR 0007) reappear on every reopen and every View change. Owned by
   * ShellChrome, which persists across both.
   */
  weeklyOfferDismissed: boolean;
  dismissWeeklyOffer: () => void;
} | null>(null);

/** Throws outside ShellChrome on purpose: every View renders inside it. */
export function useCoachOverlay() {
  const ctx = useContext(CoachOverlayContext);
  if (!ctx) throw new Error('useCoachOverlay must be used within ShellChrome');
  return ctx;
}
