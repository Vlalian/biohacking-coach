import { describe, it, expect } from 'vitest';
import {
  completeTransition,
  isFutureDated,
  skipTransition,
  unavailableTransition,
} from './session-status-rules';

/**
 * The transition semantics, tested without a database — which is the point of
 * splitting them out of the adapter. Each case here previously required mocking
 * a Drizzle chain to assert one string.
 */

describe('skipTransition', () => {
  it('skips a planned session and records the skip', () => {
    expect(skipTransition('planned')).toEqual({
      next: 'skipped',
      parked: false,
      event: 'session_skipped',
    });
  });

  it('undoes a skip back to planned', () => {
    expect(skipTransition('skipped')).toEqual({
      next: 'planned',
      parked: false,
      event: 'session_skip_undone',
    });
  });

  it('treats any other status as "not yet skipped"', () => {
    // Only 'skipped' undoes; unavailable-then-skip is a skip, not an undo.
    expect(skipTransition('unavailable').next).toBe('skipped');
  });

  it('never parks — parking belongs to Unavailable, not to a skip', () => {
    // A skip records "didn't happen"; unavailable declares "can't happen as
    // placed" and is the only one that parks (CONTEXT.md, Unavailable).
    expect(skipTransition('planned').parked).toBe(false);
    expect(skipTransition('skipped').parked).toBe(false);
  });
});

describe('unavailableTransition', () => {
  it('parks a planned session in place', () => {
    expect(unavailableTransition('planned')).toEqual({
      next: 'unavailable',
      parked: true,
      event: 'session_marked_unavailable',
    });
  });

  it('unparks back to planned', () => {
    expect(unavailableTransition('unavailable')).toEqual({
      next: 'planned',
      parked: false,
      event: 'session_unavailable_undone',
    });
  });

  it('parked always mirrors the status it writes', () => {
    // The calendar's dashed-dot affordance and Session Move's "a parked session
    // doesn't drag" rule both read `parked`, so it must never disagree.
    for (const status of ['planned', 'skipped', 'unavailable']) {
      const t = unavailableTransition(status);
      expect(t.parked).toBe(t.next === 'unavailable');
    }
  });
});

describe('completeTransition', () => {
  it('is one-directional — always completed, never a way back', () => {
    expect(completeTransition()).toEqual({
      next: 'completed',
      parked: false,
      event: 'session_completed',
    });
  });
});

describe('isFutureDated', () => {
  it('rejects tomorrow — nothing in the future is done yet', () => {
    expect(isFutureDated('2026-07-16', '2026-07-15')).toBe(true);
  });

  it('accepts today and the past', () => {
    expect(isFutureDated('2026-07-15', '2026-07-15')).toBe(false);
    expect(isFutureDated('2026-07-14', '2026-07-15')).toBe(false);
  });
});
