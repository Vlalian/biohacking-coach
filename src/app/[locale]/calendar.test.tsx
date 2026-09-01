import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@/features/session/session';

/**
 * The Head Coach's calendar is read-only in every respect but placement, and
 * this pins the half of that which is easy to get wrong: what it *offers*.
 *
 * Rendered rather than asserted on props. The bug these tests exist for shipped
 * as a perfectly reasonable-looking prop — sessions called `onOpenSession`, and
 * `SessionDrawer` simply was not rendered in read-only mode, so the click did
 * nothing. Nothing about the call site looked wrong; only the output did.
 *
 * `renderToStaticMarkup` and not a DOM harness because everything under test is
 * the first render of pure presentational markup. No effects, no interaction.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => 'date' }),
  useLocale: () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Server-action modules whose import chain reaches auth and therefore the
// database. None of them is called by a first render.
vi.mock('./move-actions', () => ({ moveSessionAction: vi.fn() }));
vi.mock('./availability-actions', () => ({
  markUnavailableDateAction: vi.fn(),
  clearUnavailableDateAction: vi.fn(),
}));
vi.mock('./rating-modal', () => ({ RatingModal: () => null }));
vi.mock('./session-drawer', () => ({ SessionDrawer: () => null }));

const { Calendar } = await import('./calendar');

const TODAY = '2026-08-19';

const session = (over: Partial<Session> = {}): Session => ({
  id: 'sess_1',
  date: '2026-08-21',
  type: 'Endurance',
  status: 'planned',
  parked: false,
  dayOrder: 0,
  title: 'Long ride',
  duration: 120,
  zone: '2',
  note: null,
  feedbackBody: null,
  feedbackMind: null,
  feedbackComment: null,
  origin: 'coach',
  isTraining: true,
  ...over,
});

const render = (props: Partial<Parameters<typeof Calendar>[0]> = {}) =>
  renderToStaticMarkup(
    <Calendar sessions={[session()]} unavailableDates={[]} todayKey={TODAY} {...props} />,
  );

/**
 * A `<button>` wrapping the session, specifically.
 *
 * Scoped rather than looking for any button: the calendar legitimately renders
 * month navigation and a per-week expand toggle, so "contains a button" would
 * pass whatever the session did.
 */
const SESSION_AS_BUTTON = /<button[^>]*>(?:(?!<\/button>)[\s\S])*?Long ride/;

describe('Calendar — what a read-only calendar offers', () => {
  it('renders no session button when there is no drawer to open', () => {
    // A coach tapping a session got nothing: the handler ran and `SessionDrawer`
    // was never rendered. A control that cannot act is worse than no control —
    // it promises a detail view that does not exist, and gives a keyboard user
    // a focus stop that leads nowhere.
    const markup = render({ readOnly: true });

    expect(markup).toContain('Long ride');
    expect(markup).not.toMatch(SESSION_AS_BUTTON);
  });

  it('still renders the athlete session button on their own calendar', () => {
    // The guard must be read-only, not "sessions are never clickable".
    const markup = render();

    expect(markup).toMatch(SESSION_AS_BUTTON);
  });

  it('keeps the coach able to drag what they cannot open', () => {
    // Placement became shared on 2026-08-21 (ADR 0003) while the rest of the
    // surface stayed read-only. Removing the button must not take drag with it.
    const markup = render({
      readOnly: true,
      onMove: async () => ({ ok: true }),
    });

    expect(markup).toContain('draggable="true"');
  });
});
