import { describe, it, expect } from 'vitest';
import {
  completeTransition,
  isFutureDated,
  offeredStatusActions,
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

describe('offeredStatusActions', () => {
  // Today is Wednesday 2026-07-15; the week runs Mon 07-13 – Sun 07-19.
  const TODAY = '2026-07-15';

  it('does not offer Mark complete on a future-dated session', () => {
    // The whole of showable-version/08: the Weekly Session writes future
    // sessions, `completeSession` refuses them, and the drawer offered the
    // button anyway — so a fresh athlete's first act was a dead press.
    const offered = offeredStatusActions({ date: '2026-07-16', status: 'planned' }, TODAY);

    expect(offered.complete).toBe(false);
    // Still movable and skippable: "not yet done" is not "untouchable".
    expect(offered.skip).toBe(true);
    expect(offered.unavailable).toBe(true);
  });

  it('offers Mark complete today and earlier in the same week', () => {
    expect(offeredStatusActions({ date: TODAY, status: 'planned' }, TODAY).complete).toBe(true);
    expect(
      offeredStatusActions({ date: '2026-07-13', status: 'planned' }, TODAY).complete,
    ).toBe(true);
  });

  it('offers nothing on a frozen session — completed, or in a past week', () => {
    expect(offeredStatusActions({ date: TODAY, status: 'completed' }, TODAY)).toEqual({
      complete: false,
      skip: false,
      unavailable: false,
    });
    expect(offeredStatusActions({ date: '2026-07-11', status: 'planned' }, TODAY)).toEqual({
      complete: false,
      skip: false,
      unavailable: false,
    });
  });
});
