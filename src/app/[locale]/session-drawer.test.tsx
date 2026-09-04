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
// The Head Coach's own actions, reached since the drawer began serving them
// too (showable-version/20). Same reason as the athlete's above: the import
// chain ends at the database, and no first render calls one.
vi.mock('./(app)/coach/athlete/[athleteId]/prescribe-actions', () => ({
  deletePrescribedSessionAction: vi.fn(),
}));
vi.mock('./session-actions', () => ({
  markCompleteAction: vi.fn(),
  toggleSkipAction: vi.fn(),
  toggleUnavailableAction: vi.fn(),
  createAthleteSessionAction: vi.fn(),
  updateAthleteSessionAction: vi.fn(),
  deleteAthleteSessionAction: vi.fn(),
}));

const { ViewBody, REFUSAL_KEY } = await import('./session-drawer');
const { athleteDrawerPolicy, headCoachDrawerPolicy } = await import(
  '@/features/session/drawer-policy',
);

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
    // Required since FR-5: every session carries the version a write
    // compare-and-sets on.
    version: 1,
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
      // The athlete's policy, which is what these characterisation tests are
      // about: parameterising the drawer must not change what she sees.
      policy: athleteDrawerPolicy(s),
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

describe('ViewBody content authority — characterisation', () => {
  /**
   * Written before `ViewBody` took its action policy as a parameter
   * (showable-version/20), not after. The origin gate was the one part of this
   * component with no test at all, and it is the part that decides whether one
   * person may rewrite another's training — so the refactor needed a net under
   * it rather than beside it.
   *
   * These assert the athlete's behaviour as it stood. If the parameterisation
   * changes any of them, it has changed what the athlete sees, which it must
   * not.
   */
  it("offers edit and delete on the athlete's own session", () => {
    const shown = render(session({ origin: 'athlete' }));

    expect(shown).toContain('edit');
    expect(shown).toContain('delete');
  });

  it('offers neither on a Coach-planned session', () => {
    // CONTEXT.md, Prescribed Session: content belongs to the author. Changing
    // the Coach's session is a conversation; skipping it records reality.
    const shown = render(session({ origin: 'coach' }));

    expect(shown).not.toContain('edit');
    expect(shown).not.toContain('delete');
  });

  it('offers neither on a Head Coach prescription', () => {
    const shown = render(session({ origin: 'head_coach' }));

    expect(shown).not.toContain('edit');
    expect(shown).not.toContain('delete');
  });

  it('offers neither on an imported activity, which is the record', () => {
    const shown = render(session({ origin: 'garmin', status: 'completed' }));

    expect(shown).not.toContain('edit');
    expect(shown).not.toContain('delete');
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

/**
 * The same drawer, opened by the Head Coach on a linked athlete's session.
 *
 * One surface, two audiences (CONTEXT.md, Session Drawer). `drawer-policy.ts`
 * decides and is tested on its own; what is proven here is the *wiring* — that
 * the drawer asks the policy, and that each flag gates the control it names. A
 * pure rule with a miswired consumer is exactly the test that appears to guard
 * and does not, which is the lesson this file already carries from
 * showable-version/08.
 */
function renderAsCoach(s: Session) {
  return labels(
    ViewBody({
      session: s,
      policy: headCoachDrawerPolicy(s, TODAY),
      fromImport: false,
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

describe('ViewBody as the Head Coach', () => {
  it('offers edit and delete on a session the coach may edit', () => {
    const shown = renderAsCoach(session({ origin: 'coach' }));

    expect(shown).toContain('edit');
    expect(shown).toContain('delete');
  });

  it('withholds them on the athlete&apos;s own session, and says whose it is', () => {
    const shown = renderAsCoach(session({ origin: 'athlete' }));

    expect(shown).not.toContain('edit');
    expect(shown).not.toContain('delete');
    expect(shown).toContain('refusalAthletesOwn');
  });

  it('withholds them on an imported activity, and calls it the record', () => {
    const shown = renderAsCoach(session({ origin: 'garmin', status: 'completed' }));

    expect(shown).not.toContain('edit');
    expect(shown).toContain('refusalImportedRecord');
  });

  it('withholds them on a completed session, and calls it frozen', () => {
    // The server does not refuse this — `loadEditable` checks origin and
    // nothing else — so until the drawer opened on every session, the only
    // thing preventing it was `planSessions` filtering completed sessions off
    // the surface. Filed separately; this is the client half holding the line.
    const shown = renderAsCoach(session({ origin: 'coach', status: 'completed' }));

    expect(shown).not.toContain('edit');
    expect(shown).toContain('refusalFrozenRecord');
  });

  it('never offers a status action, whatever the session', () => {
    // Completing a session claims training happened in someone else's body.
    // The Head Coach outranks the AI but not reality (ADR 0003).
    for (const status of ['planned', 'completed', 'skipped']) {
      const shown = renderAsCoach(session({ origin: 'coach', status }));

      expect(shown, status).not.toContain('markComplete');
      expect(shown, status).not.toContain('skip');
      expect(shown, status).not.toContain('unavailable');
    }
  });

  it('never offers to rate, because a reflection is the athlete&apos;s report', () => {
    const rated = renderAsCoach(
      session({ origin: 'coach', status: 'completed', feedbackBody: 4, feedbackMind: 4 }),
    );
    const unrated = renderAsCoach(session({ origin: 'coach', status: 'completed' }));

    expect(rated).not.toContain('editRating');
    expect(unrated).not.toContain('rate');
  });

  it('shows a reflection it was given, because reading one is the job', () => {
    // Link Visibility is applied server-side in `roster-service`: a withheld
    // reflection never reaches this component. What arrives is meant to be read.
    const shown = renderAsCoach(
      session({ origin: 'coach', status: 'completed', feedbackBody: 4, feedbackMind: 2 }),
    );

    expect(shown).toContain('reflection');
  });

  it('shows no reflection when Link Visibility withheld it', () => {
    // Stripped upstream, so the fields arrive null and the drawer must not
    // invent a rating from anything else it holds.
    const shown = renderAsCoach(session({ origin: 'coach', status: 'completed' }));

    expect(shown).toContain('notRated');
  });

  it('never offers Discuss with Coach, because they are the coach', () => {
    expect(renderAsCoach(session({ origin: 'coach' }))).not.toContain('discuss');
  });

  it('names a message that exists, for every refusal it can state', async () => {
    const { CONTENT_REFUSAL_KEY } = await import('./session-drawer');
    const en = (await import('@/messages/en.json')).default.SessionDrawer;

    for (const key of Object.values(CONTENT_REFUSAL_KEY)) {
      expect(Object.keys(en), `no message for "${key}"`).toContain(key);
    }
  });
});
