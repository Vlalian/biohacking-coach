import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Session } from '@/features/session/session';

// The drawer is a client component: importing it pulls next-intl's client
// navigation, the Coach Overlay context and the server actions, none of which
// this test drives. The actions reach the database through `current-actor`;
// `ViewBody` only ever receives callbacks, so it never calls one.
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/shell/coach-overlay-context', () => ({
  useCoachOverlay: () => ({ setReference: vi.fn(), setOpen: vi.fn() }),
}));
vi.mock('./garmin-actions', () => ({ undoDetectedImportAction: vi.fn() }));
vi.mock('./session-actions', () => ({
  markCompleteAction: vi.fn(),
  toggleSkipAction: vi.fn(),
  toggleUnavailableAction: vi.fn(),
  createAthleteSessionAction: vi.fn(),
  updateAthleteSessionAction: vi.fn(),
  deleteAthleteSessionAction: vi.fn(),
}));

const { ViewBody, REFUSAL_KEY } = await import('./session-drawer');

/**
 * What the Session Drawer offers, and why each of the two efforts that landed
 * here cares.
 *
 * **showable-version/08** — `offeredStatusActions` decides which status actions
 * a session offers, and `session-status-rules.test.ts` proves that decision.
 * What is proven here is the *wiring*: that the drawer asks it, and that each
 * flag gates the button it is named for. A pure rule with a miswired consumer is
 * exactly the test that appears to guard and does not.
 *
 * **showable-version/14** — undo is offered only where the event log says the
 * completion came from an import. `undoDetectedImport` proves the server refuses
 * anything else; this proves the drawer does not offer a general un-complete
 * button, which the domain model does not have.
 *
 * There is no DOM renderer in this repo, so the test calls `ViewBody` and walks
 * the returned element tree. `t` is mocked to return its key, so the labels
 * below are message keys rather than English.
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
    // Planned by default: the status-action tests are about what a live session
    // offers. The undo tests below ask for `completed` explicitly, because that
    // is the state undo exists for.
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

function render(s: Session, fromImport = false) {
  return labels(
    ViewBody({
      session: s,
      fromImport,
      todayKey: TODAY,
      locale: 'en',
      pending: false,
      t: ((key: string) => key) as never,
      onMarkComplete: vi.fn(),
      onSkip: vi.fn(),
      onMarkUnavailable: vi.fn(),
      onUndoImport: vi.fn(),
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

describe('ViewBody undo import', () => {
  it('offers no undo on an ordinary completed session', () => {
    expect(render(session({ status: 'completed' }))).not.toContain('undoImport');
  });

  it('offers undo on a session completed by accepting a Detected Activity', () => {
    // The only way back: Skip, Session Move and delete all refuse a completed
    // Coach-planned session.
    expect(render(session({ status: 'completed' }), true)).toContain('undoImport');
  });

  it('offers undo even though the session is frozen, which is the point of it', () => {
    // The status actions are gated by `offeredStatusActions` and a frozen
    // session offers none of them. Undo deliberately sits outside that gate —
    // if it did not, the one control that can walk back a wrong import would be
    // hidden exactly when it is needed. Pins the two gates apart, because the
    // merge that brought them together could quietly have joined them.
    const shown = render(session({ date: '2026-07-11', status: 'completed' }), true);

    expect(shown).not.toContain('markComplete');
    expect(shown).not.toContain('skip');
    expect(shown).toContain('undoImport');
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
