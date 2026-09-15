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

  it('opens a session for a Head Coach on a linked athlete', () => {
    // The read-only calendar rendered no drawer at all, so a coach could see a
    // session and never read it — not the note, not the reflection, not the
    // record they are meant to judge the plan against (showable-version/20).
    // `readOnly` still holds for everything else on the surface.
    const markup = render({ readOnly: true, coachAthleteId: 'ath_1' });

    expect(markup).toMatch(SESSION_AS_BUTTON);
  });

  it("still renders no button for a read-only calendar that is nobody's coach view", () => {
    // The guard must stay "is there a drawer to open", not "is it read-only".
    const markup = render({ readOnly: true });

    expect(markup).not.toMatch(SESSION_AS_BUTTON);
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
 * the chip back and looked exactly like a move that had worked.
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
   * chip asks it, and that the answer reaches the markup rather than being
   * collapsed back into a boolean on the way.
   *
   * `t` is mocked to return its key, so the assertions below are message keys.
   * The current week is expanded on first render, so a session dated in it is a
   * real `SessionChip` here and not a collapsed dot.
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

  it('keeps the date label out of the row handler, so it toggles once', () => {
    // The button and the row both toggle. Without the marker the button's own
    // click bubbles to the row, `toggleWeek` runs twice against a functional
    // setState, and the week does not move at all — the failure is silent and
    // it lands hardest on the keyboard user, whose Enter also fires a click.
    // The marker is what the row handler's selector excludes.
    const markup = render();

    expect(markup).toMatch(/<button[^>]*data-week-toggle=/);
  });
});

/**
 * `training-architecture/06` — the health layer, drawn beside the plan.
 *
 * Option (a), decided 2026-09-11: a band above the seven day cells spanning
 * only the affected days; an injury chip at its left on every week the injury
 * is open; muted, never red; one click into the Health Drawer; and a persistent
 * "How's your body?" button for the athlete, never for the Head Coach.
 */
vi.mock('./health-drawer', () => ({ HealthDrawer: () => <div data-testid="health-drawer" /> }));

describe('the health layer (training-architecture/06)', () => {
  const ILL_WEEK_START = '2026-08-17'; // TODAY is Wed 2026-08-19
  const illness = { kind: 'illness' as const, id: 'ill_1', from: '2026-08-18', to: null, bother: null };
  const injury = {
    kind: 'injury' as const, id: 'inj_1', from: '2026-08-01', to: null,
    capacity: { swim: 'full' as const, bike: 'easy' as const, run: 'none' as const }, bother: 3,
  };

  it('renders byte-identical markup with no health prop and with an empty list — nothing is added for the healthy', () => {
    expect(render({ health: [] })).toBe(render());
    expect(render()).not.toContain('data-health');
  });

  it('draws an illness band over exactly the ill days of that week, and not into the future', () => {
    const html = render({ health: [illness] });
    const cells = [...html.matchAll(/data-health-day="([^"]+)"(?: data-ill="true")?/g)];
    const ill = cells.filter((m) => m[0].includes('data-ill="true"')).map((m) => m[1]);
    // Declared Tuesday the 18th; today is Wednesday the 19th: two days, no more.
    expect(ill).toEqual(['2026-08-18', '2026-08-19']);
    expect(html).toContain('healthIll');
    expect(html).toContain(`data-health-week="${ILL_WEEK_START}"`);
  });

  it('draws an injury chip with the glance on every week the injury is open', () => {
    const html = render({ health: [injury] });
    const chips = html.match(/data-health-chip="inj_1"/g) ?? [];
    // The calendar renders the weeks of the viewed month; the injury has been
    // open since the 1st, so every one of them carries the chip.
    expect(chips.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('glance_none_run');
    expect(html).toContain('glance_easy_bike');
  });

  it('leaves the sessions exactly as they were — the layer adds, it never restyles', () => {
    const plain = render();
    const layered = render({ health: [injury, illness] });
    const chip = (html: string) => html.match(SESSION_AS_BUTTON)?.[0];
    expect(chip(layered)).toBe(chip(plain));
    const dayCell = (html: string) => html.match(/<div[^>]*data-day="2026-08-21"[^>]*>/)?.[0];
    expect(dayCell(layered)).toBe(dayCell(plain));
  });

  it('uses the muted tone, never the destructive one', () => {
    const html = render({ health: [injury, illness] });
    const layer = html.match(/<div[^>]*data-health-week[\s\S]*?<\/div>\s*<\/div>/g)?.join('') ?? '';
    expect(layer).not.toContain('destructive');
    expect(layer).not.toContain('red');
    expect(layer).toContain('muted');
  });

  it('draws nothing for a record closed before the week', () => {
    const closed = { ...injury, to: '2026-08-10' };
    const closedIllness = { ...illness, from: '2026-08-03', to: '2026-08-05' };
    const html = render({ health: [closed, closedIllness] });
    expect(html).not.toContain(`data-health-week="${ILL_WEEK_START}"`);
  });

  it('offers "How\u2019s your body?" to the athlete whether or not anything is open, and never to the Head Coach', () => {
    expect(render()).toContain('healthButton');
    expect(render({ health: [injury] })).toContain('healthButton');
    expect(render({ readOnly: true, coachAthleteId: 'a1', health: [injury] })).not.toContain('healthButton');
  });

  it('gives the Head Coach the same band and chip when the athlete shares them', () => {
    const html = render({ readOnly: true, coachAthleteId: 'a1', health: [injury, illness] });
    expect(html).toContain('data-health-chip="inj_1"');
    expect(html).toContain('data-ill="true"');
  });
});
