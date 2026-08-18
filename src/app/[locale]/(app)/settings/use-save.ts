'use client';

import { useState } from 'react';

/**
 * The one save dance every Settings field performs.
 *
 * Each field on this page does exactly the same thing when the athlete changes
 * it: mark it in flight, call a server action, keep the new value only if the
 * action said ok, show an error if it did not, and clear the in-flight flag
 * whichever way it went. That was written out six times, and each copy had to
 * remember the same two easy-to-miss details:
 *
 *   - the optimistic value is committed *after* the action succeeds, never
 *     before, so a refused write does not leave the UI claiming a setting that
 *     the server does not have;
 *   - a *rejected* action (network drop, redeploy mid-click) is caught, not just
 *     an `ok: false` result — otherwise the field stays disabled until the
 *     athlete reloads the page.
 *
 * Both live here now, once.
 */

/** What a Settings server action returns: ok, or a reason the UI shows as an error. */
type ActionResult = { ok: boolean };

export interface SaveState {
  /** True while the action is in flight — fields disable their controls on it. */
  pending: boolean;
  /** True when the last attempt failed, either refused or thrown. */
  error: boolean;
  /**
   * Runs the action and reports whether it succeeded. Commit the new value on
   * `true` and nothing on `false`, so the UI never shows an unsaved setting as
   * saved.
   */
  run: (action: () => Promise<ActionResult>) => Promise<boolean>;
}

export function useSave(): SaveState {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function run(action: () => Promise<ActionResult>): Promise<boolean> {
    setPending(true);
    setError(false);
    try {
      const result = await action();
      if (!result.ok) {
        setError(true);
        return false;
      }
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, run };
}

/**
 * The same dance for the two fields that show an explicit saved/error status
 * beside a Save button, rather than only disabling while in flight.
 *
 * `idle` is reset by the field itself when the athlete edits the draft again —
 * a stale "saved" beside changed text is a small lie the athlete will believe.
 */
export type SaveStatusValue = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStatusState {
  status: SaveStatusValue;
  /** Back to idle — call when the draft changes so a stale "saved" clears. */
  reset: () => void;
  run: (action: () => Promise<ActionResult>) => Promise<void>;
}

export function useSaveStatus(): SaveStatusState {
  const [status, setStatus] = useState<SaveStatusValue>('idle');

  async function run(action: () => Promise<ActionResult>): Promise<void> {
    setStatus('saving');
    try {
      const result = await action();
      setStatus(result.ok ? 'saved' : 'error');
    } catch {
      // A rejected server action (network drop, redeploy) must still leave
      // 'saving', or the button stays disabled until the athlete reloads.
      setStatus('error');
    }
  }

  return { status, reset: () => setStatus('idle'), run };
}
