import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';

// The drawer is a client component: importing it pulls next-intl's client
// navigation and the Coach Overlay context, neither of which this test drives.
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/shell/coach-overlay-context', () => ({
  useCoachOverlay: () => ({ setReference: vi.fn(), setOpen: vi.fn() }),
}));
// The server actions reach the database through `current-actor`; `ViewBody`
// only ever receives callbacks, so it never calls one.
vi.mock('./session-actions', () => ({
  markCompleteAction: vi.fn(),
  toggleSkipAction: vi.fn(),
  toggleUnavailableAction: vi.fn(),
  createAthleteSessionAction: vi.fn(),
  updateAthleteSessionAction: vi.fn(),
  deleteAthleteSessionAction: vi.fn(),
}));

const { ViewBody, REFUSAL_KEY } = await import('./session-drawer');
import type { Session } from '@/features/session/session';

/**
 * The Session Drawer's action gating (showable-version/08).
 *
 * `offeredStatusActions` decides which actions a session offers, and
 * `session-status-rules.test.ts` proves that decision. This proves the wiring:
 * that the drawer asks it, and that each flag gates the button it is named
 * for. A pure rule with a miswired consumer is exactly the test that appears
 * to guard and does not.
 *
 * There is no DOM renderer in this repo, so the test calls `ViewBody` and
 * walks the returned element tree. `t` is mocked to return its key, so the
 * labels below are message keys rather than English.
 */

/** Every string in an unrendered element tree, children props included. */
function labels(node: ReactNode): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(labels);
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return labels(props?.children);
  }
  return [];
}

const TODAY = '2026-07-15'; // Wednesday; the week runs Mon 07-13 – Sun 07-19.

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    date: TODAY,
    type: 'Run',
    status: 'planned',
    parked: false,
    dayOrder: 0,
    title: null,
    duration: 60,
    zone: null,
    note: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    origin: 'coach',
    isTraining: true,
    ...overrides,
  };
}

function render(s: Session) {
  return labels(
    ViewBody({
      session: s,
      todayKey: TODAY,
      locale: 'en',
      pending: false,
      t: ((key: string) => key) as never,
      onMarkComplete: vi.fn(),
      onSkip: vi.fn(),
      onMarkUnavailable: vi.fn(),
      onDiscussWithCoach: vi.fn(),
      onRate: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    }),
  );
}

describe('ViewBody status actions', () => {
  it('offers Mark complete on a session dated today', () => {
    expect(render(session())).toContain('markComplete');
  });

  it('does not offer Mark complete on a future-dated session', () => {
    // Every session the Weekly Session writes is future-dated, so this is what
    // a freshly-onboarded athlete sees.
    const shown = render(session({ date: '2026-07-16' }));

    expect(shown).not.toContain('markComplete');
    expect(shown).toContain('skip');
    expect(shown).toContain('unavailable');
  });

  it('offers no status action on a frozen session', () => {
    const shown = render(session({ date: '2026-07-11' })); // last week

    expect(shown).not.toContain('markComplete');
    expect(shown).not.toContain('skip');
    expect(shown).not.toContain('unavailable');
    // Still reachable — a frozen session can be discussed and rated.
    expect(shown).toContain('discuss');
  });
});

describe('REFUSAL_KEY', () => {
  it('tells "not yet" apart from "too late"', async () => {
    // The drawer stored failure as a boolean, so a future session and a frozen
    // one both rendered "That didn't work. Try again." Mapping either back to
    // the generic string would restore that, silently.
    const en = (await import('@/messages/en.json')).default.SessionDrawer;

    expect(REFUSAL_KEY.future).not.toBe(REFUSAL_KEY.frozen);
    expect(REFUSAL_KEY.future).not.toBe('error');
    expect(REFUSAL_KEY.frozen).not.toBe('error');

    for (const key of Object.values(REFUSAL_KEY)) {
      expect(Object.keys(en), `no message for "${key}"`).toContain(key);
    }
  });
});
