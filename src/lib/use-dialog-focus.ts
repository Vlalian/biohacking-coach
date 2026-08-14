'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * The focus lifecycle every modal overlay owes a keyboard user, in one place.
 *
 * Four things, none of which a `<div>` does on its own: move focus into the
 * dialog when it opens, keep Tab inside it, close on Escape, and give focus
 * back to whatever opened it. Without them a keyboard or screen-reader user
 * tabs straight out of the overlay into the page behind it — reaching controls
 * that are visually covered and, on a drawer, invisible.
 *
 * Returns the ref to spread onto the dialog panel. The panel needs
 * `tabIndex={-1}` so it can receive focus itself, plus `role="dialog"` and
 * `aria-modal="true"` so it is announced as one.
 *
 * Extracted from `rating-modal.tsx`, which had the only correct copy; the
 * Session Drawer, the Equipment form and the Weekly Session proposal each had
 * none. A shared hook rather than four copies, because this is precisely the
 * kind of detail that gets fixed in one dialog and forgotten in the rest.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  /**
   * Whether the dialog is currently open. Hooks cannot be called conditionally,
   * but some of these overlays stay mounted and render `null` when closed — and
   * a closed dialog must not swallow Escape or move focus. Defaults to true for
   * the overlays that unmount instead.
   */
  enabled = true,
): RefObject<T | null> {
  const panelRef = useRef<T>(null);

  useEffect(() => {
    if (!enabled) return;

    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), ' +
          'input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restoring focus is what makes the overlay a detour rather than a
      // dead end: the athlete lands back on the control they opened it from.
      opener?.focus();
    };
  }, [onClose, enabled]);

  return panelRef;
}
