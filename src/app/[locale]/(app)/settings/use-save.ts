'use client';

import { useRef, useState } from 'react';

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
 * Both live here now, once. Two hooks rather than one because the two output
 * shapes are genuinely different and both are used: most fields only disable
 * their controls while in flight, while the two free-text fields show an
 * explicit saved/error status beside a Save button. They share {@link attempt},
 * so the try/catch itself is written once.
 */

/**
 * All these hooks need of a Settings server action: whether it succeeded. The
 * actions return richer results, but no field of them is read here — a field
 * that reached this far would be a reason to widen the type deliberately.
 */
type ActionResult = { ok: boolean };

/**
 * Run the action and say only whether it worked, turning both failure modes into
 * the same `false`: a refusal (`ok: false`) and a rejected call (network drop,
 * redeploy mid-click). Both hooks below share it, so neither can forget the
 * second — which is the one that leaves a field disabled until the athlete
 * reloads the page.
 */
async function attempt(action: () => Promise<ActionResult>): Promise<boolean> {
  try {
    return (await action()).ok;
  } catch {
    return false;
  }
}

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
    const ok = await attempt(action);
    if (!ok) setError(true);
    setPending(false);
    return ok;
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
  // Which save the displayed status belongs to. A save that finishes after the
  // athlete has already edited the draft again must not paint 'saved' over the
  // idle state that edit produced — that is precisely the stale "saved" beside
  // changed text this hook exists to prevent, arriving by a slower route.
  const generation = useRef(0);

  async function run(action: () => Promise<ActionResult>): Promise<void> {
    const mine = ++generation.current;
    setStatus('saving');
    const ok = await attempt(action);
    if (generation.current !== mine) return;
    setStatus(ok ? 'saved' : 'error');
  }

  function reset() {
    // Invalidates any save still in flight, so its result is discarded rather
    // than landing on top of the athlete's newer draft.
    generation.current += 1;
    setStatus('idle');
  }

  return { status, reset, run };
}
