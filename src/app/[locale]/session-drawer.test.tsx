import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Session } from '@/features/session/session';

// The drawer is a client component: importing it pulls next-intl's client
// navigation, the Coach Overlay context and the server actions, none of which
// this test drives.
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

const { ViewBody } = await import('./session-drawer');

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

const TODAY = '2026-07-15';

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    date: TODAY,
    type: 'Run',
    status: 'completed',
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

/**
 * The undo affordance for an accepted Detected Activity (showable-version/14).
 *
 * `undoDetectedImport` proves the server refuses anything the event log does
 * not call an import. This proves the drawer offers the control only where
 * there is one to offer — a general un-complete button is exactly what the
 * domain model does not have.
 */
describe('ViewBody undo import', () => {
  it('offers no undo on an ordinary completed session', () => {
    expect(render(session())).not.toContain('undoImport');
  });

  it('offers undo on a session completed by accepting a Detected Activity', () => {
    // The only way back: Skip, Session Move and delete all refuse a completed
    // Coach-planned session.
    expect(render(session(), true)).toContain('undoImport');
  });
});
