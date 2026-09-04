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

const { Calendar, MOVE_REFUSAL_KEY, liftRefusal } = await import('./calendar');

const TODAY = '2026-08-19';

const session = (over: Partial<Session> = {}): Session => ({
  id: 'sess_1',
  date: '2026-08-21',
  // Required since FR-5: every session carries the version a write
  // compare-and-sets on.
  version: 1,
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

/**
 * Every way a Session Move can come back refused, and what the athlete reads.
 *
 * The calendar already explained the two refusals it decides for itself — a past
 * day and another week. It explained none of the ones the *server* decides:
 * `handleDrop` matched `conflict` and let `not-owner`, `frozen`, `bounce` and
 * `not-authenticated` fall through to a bare `router.refresh()`, which snapped
 * the block back and looked exactly like a move that had worked.
 *
 * That is the defect showable-version/08 fixed one layer in, and the comment
 * above that very line says so — "A refused move used to look identical to a
 * successful one... Say so instead." It was true of one reason out of five.
 */
describe('MOVE_REFUSAL_KEY', () => {
  // The server's own union, listed rather than derived: a runtime test cannot
  // read a type. `Record<MoveRefusal, string>` is what makes a missing entry a
  // compile error; this is what makes a *new* reason nobody mapped visible here.
  const SERVER_REASONS = [
    // `MoveResult` — the athlete's door.
    'not-authenticated',
    'not-found',
    'not-owner',
    'frozen',
    'bounce',
    'conflict',
    // `moveSessionAsCoachAction` refuses two more ways. `tsc` found these when
    // the record was first written without them, which is the property this
    // record exists for working before anyone shipped it.
    'not-linked',
    'not-a-coach',
  ] as const;

  it('maps every reason the server can refuse with', () => {
    expect(Object.keys(MOVE_REFUSAL_KEY).sort()).toEqual([...SERVER_REASONS].sort());
  });

  it('names a message that exists, for every reason', async () => {
    const en = (await import('@/messages/en.json')).default.Calendar;

    for (const key of Object.values(MOVE_REFUSAL_KEY)) {
      expect(Object.keys(en), `no message for "${key}"`).toContain(key);
    }
  });

  it('tells the refusals apart that the athlete can act on', () => {
    // The three an athlete or coach can do something about. Collapsing any of
    // them into the generic string restores the silence this ticket exists for.
    expect(MOVE_REFUSAL_KEY['not-owner']).not.toBe(MOVE_REFUSAL_KEY['not-found']);
    expect(MOVE_REFUSAL_KEY.frozen).not.toBe(MOVE_REFUSAL_KEY['not-found']);
    expect(MOVE_REFUSAL_KEY.bounce).not.toBe(MOVE_REFUSAL_KEY['not-found']);
    expect(MOVE_REFUSAL_KEY.conflict).not.toBe(MOVE_REFUSAL_KEY['not-found']);
  });

  it('shares one generic message for the refusals nobody can act on', () => {
    // REFUSAL_KEY's rule, applied here: a missing row or a signed-out tab is not
    // the athlete's to fix, and naming it would leak the shape of the system
    // without helping.
    expect(MOVE_REFUSAL_KEY['not-found']).toBe(MOVE_REFUSAL_KEY['not-authenticated']);
  });
});

/**
 * Why a session cannot be picked up at all — the refusal that had no voice.
 *
 * `bounceFrozen` existed and was unreachable. `rejectionFor` only returns
 * `'frozen'` when `classifyMove` says so, `classifyMove` says so only when
 * `isFrozen` does, and a session `isFrozen` agrees with is never `draggable` —
 * so the drag that would have produced the message could never start. The copy
 * was written, translated, and dead.
 *
 * That is the exact case Mads hit on the 2026-09-04 smoke run: completed and
 * past-week sessions refused to lift, and said nothing.
 */
describe('liftRefusal', () => {
  const MONDAY_THIS_WEEK = '2026-08-17';
  const LAST_WEEK = '2026-08-12';

  it('refuses a completed session, because the record is immutable', () => {
    expect(liftRefusal({ date: TODAY, status: 'completed', parked: false }, TODAY)).toBe('frozen');
  });

  it('refuses anything in a past week', () => {
    // Frozen for a different reason than "completed": Week Rebalancing has
    // already absorbed the missed load (ADR 0002), so last week is closed even
    // for a session that never happened.
    expect(liftRefusal({ date: LAST_WEEK, status: 'planned', parked: false }, TODAY)).toBe('frozen');
  });

  it('refuses a parked session, and says something different about it', () => {
    // Parked is not frozen: the session is held by a Rest block and returns to
    // planned on its own if the Rest moves away (CONTEXT.md, Displacement). An
    // athlete told "this is frozen" would reasonably think it was permanent.
    expect(liftRefusal({ date: TODAY, status: 'unavailable', parked: true }, TODAY)).toBe('parked');
  });

  it('lets an ordinary planned session in the current week be lifted', () => {
    expect(liftRefusal({ date: MONDAY_THIS_WEEK, status: 'planned', parked: false }, TODAY)).toBeNull();
  });

  it('agrees with isFrozen rather than re-deciding it', async () => {
    // The rules live in move-rules.ts and the server applies the same ones
    // (ADR 0006). A second copy here is how the message and the refusal drift.
    const { isFrozen } = await import('@/features/session/move-rules');

    for (const date of [TODAY, LAST_WEEK, '2026-08-21']) {
      for (const status of ['planned', 'completed', 'skipped', 'unavailable']) {
        const frozen = isFrozen({ date, status }, TODAY);
        expect(liftRefusal({ date, status, parked: false }, TODAY) === 'frozen').toBe(frozen);
      }
    }
  });

  it('names a message that exists, for every reason it can give', async () => {
    const en = (await import('@/messages/en.json')).default.Calendar;

    for (const reason of ['frozen', 'parked'] as const) {
      const key = reason === 'frozen' ? 'bounceFrozen' : 'bounceParked';
      expect(Object.keys(en), `no message for "${key}"`).toContain(key);
    }
  });
});

describe('Calendar — a session that cannot be lifted says why', () => {
  /**
   * The wiring half of `liftRefusal`. The rule is proven above; this proves the
   * block asks it, and that the answer reaches the markup rather than being
   * collapsed back into a boolean on the way.
   *
   * `t` is mocked to return its key, so the assertions below are message keys.
   * The current week is expanded on first render, so a session dated in it is a
   * real `SessionBlock` here and not a collapsed chip.
   */
  it('explains a completed session instead of being silently inert', () => {
    const markup = render({ sessions: [session({ status: 'completed' })] });

    expect(markup).toContain('bounceFrozen');
    expect(markup).not.toContain('draggable="true"');
  });

  it('tells a parked session apart from a frozen one', () => {
    // Different refusal, different sentence: parked resolves itself when the
    // Rest block moves away, and "frozen" would describe it as permanent.
    const markup = render({
      sessions: [session({ status: 'unavailable', parked: true })],
    });

    expect(markup).toContain('bounceParked');
    expect(markup).not.toContain('bounceFrozen');
  });

  it('says nothing about a session that can simply be dragged', () => {
    // The message is a refusal, not a label. A movable session carries neither.
    const markup = render();

    expect(markup).toContain('draggable="true"');
    expect(markup).not.toContain('bounceFrozen');
    expect(markup).not.toContain('bounceParked');
  });
});

describe('Calendar — the week row is the toggle', () => {
  /**
   * `CONTEXT.md`'s Expanded Week says "Tapping a week row toggles it." Only the
   * 56-pixel date label was a button, so the row and the glossary disagreed.
   *
   * The click itself is not testable here — `renderToStaticMarkup` drops event
   * handlers and this repo has no DOM renderer — so what is pinned is the
   * precondition the handler depends on: every day cell is marked, so the row
   * handler can tell "clicked the row" from "clicked a day" and let the day's
   * own controls through. Remove the marker and the row would start swallowing
   * drags and the ✕; that regression is what this test catches.
   */
  it('marks every day cell so the row handler can let them through', () => {
    const markup = render();

    // Seven days in the current week, plus the surrounding weeks the month grid
    // renders. The exact count is not the point; the marker being present is.
    expect(markup).toContain('data-day=');
    expect((markup.match(/data-day=/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it('keeps the date label a real button, for keyboard users', () => {
    // The row click is a mouse convenience. A div with an onClick is not
    // reachable by keyboard, so the button stays and remains the accessible
    // path — widening the hit area must not narrow who can reach it.
    const markup = render();

    expect(markup).toMatch(/<button[^>]*aria-expanded=/);
  });
});
