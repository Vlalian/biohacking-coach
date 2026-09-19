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
const { dateTime } = vi.hoisted(() => ({ dateTime: vi.fn((_d: Date, _opts?: unknown) => 'date') }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime }),
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
// The card reaches the overlay context and three server actions; the calendar
// test asserts where it is rendered, not what it does.
vi.mock('./redraft-card', () => ({
  RedraftCard: ({ weekStart }: { weekStart: string }) => <div data-redraft-card={weekStart} />,
}));
vi.mock('./drafting-card', () => ({
  DraftingCard: ({ weekStart }: { weekStart: string }) => <div data-drafting-card={weekStart} />,
}));
vi.mock('./proposal-card', () => ({
  ProposalCard: ({ draft }: { draft: { id: string } }) => <div data-proposal-card={draft.id} />,
}));

const { Calendar, MOVE_REFUSAL_KEY, liftRefusal, HEADER_DAYS } = await import('./calendar');

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

describe('Calendar — the drafted week the athlete has not decided on (training-architecture/18)', () => {
  const draft = {
    id: 'd1',
    weekStart: '2026-08-24',
    visibleFrom: '2026-08-19',
    sessions: [
      { date: '2026-08-25', type: 'Endurance' as const, durationMinutes: 60, zone: 'Z2', note: null },
      { date: '2026-08-27', type: 'Intensity' as const, durationMinutes: 45, zone: null, note: null },
    ],
    citations: [],
    approved: false,
    createdAt: new Date(),
  };

  it('renders nothing new when no proposal is passed — the markup is what it was before 18', () => {
    const markup = render();
    expect(markup).not.toContain('data-proposal-card');
    expect(markup).not.toContain('data-proposed');
    expect(markup).not.toContain('data-discussing');
    expect(markup).toMatchSnapshot();
  });

  it('renders the card above the grid and one ghosted chip per proposed session in the draft’s week only', () => {
    const markup = render({ proposal: { kind: 'proposal', draft } });
    expect(markup).toContain('data-proposal-card="d1"');
    // The draft's week (24–30 Aug) is not the current week (19 Aug is a
    // Wednesday, week of the 17th), so it renders collapsed: one dashed dot per
    // proposed session, labelled as proposed — never as a session.
    // The accessible name carries what the eye sees: type and minutes (a
    // session with no duration names just the type). CodeRabbit, PR #69.
    expect(markup.match(/aria-label="Endurance · 60 min · proposedChip"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="Intensity · 45 min · proposedChip"/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<button[^>]*proposedChip/);
    expect(markup).not.toMatch(/draggable="true"[^>]*proposedChip/);
  });

  it('renders the re-draft offer in the card’s place for a declined week (training-architecture/24)', () => {
    const markup = render({ proposal: { kind: 'redraft-offer', weekStart: '2026-08-24' } });
    expect(markup).toContain('data-redraft-card="2026-08-24"');
    expect(markup).not.toContain('data-proposal-card');
    expect(markup).not.toContain('proposedChip');
  });

  it('a drafting slot shows the drafting card in the proposal card’s place, and no proposal card (training-architecture/29)', () => {
    const markup = render({ proposal: { kind: 'drafting', weekStart: '2026-08-24' } });
    expect(markup).toContain('data-drafting-card="2026-08-24"');
    expect(markup).not.toContain('data-proposal-card');
    expect(markup).not.toContain('proposedChip');
  });

  it('renders the pointer, and no card and no chips, while the draft is being discussed', () => {
    const markup = render({ proposal: { kind: 'discussing', conversationId: 'c1', weekStart: '2026-08-24' } });
    expect(markup).toContain('data-discussing="c1"');
    expect(markup).toContain('>discussing<');
    expect(markup).not.toContain('data-proposal-card');
    expect(markup).not.toContain('proposedChip');
  });
});

/**
 * `training-architecture/06` → `showable-version/28a` — the health layer,
 * drawn beside the plan. Rulings of 2026-09-17/18: two icons on every recorded
 * session a record covers (signal while open, muted once over, forever), none
 * on a proposed session; the illness band is gone; the health row is an
 * always-shown two-status area that opens the drawer; and the persistent
 * "How's your body?" button for the athlete, never for the Head Coach.
 */
vi.mock('./health-drawer', () => ({ HealthDrawer: () => <div data-testid="health-drawer" /> }));

describe('the health layer (training-architecture/06, showable-version/28a)', () => {
  const illness = {
    kind: 'illness' as const, id: 'ill_1', from: '2026-08-18', to: null, bother: null,
    name: null, openedAt: new Date('2026-08-18T08:00:00Z'),
  };
  const injury = {
    kind: 'injury' as const, id: 'inj_1', from: '2026-08-01', to: null,
    capacity: { swim: 'full' as const, bike: 'easy' as const, run: 'none' as const }, bother: 3,
    name: 'left knee', openedAt: new Date('2026-08-01T08:00:00Z'),
  };
  const draft = {
    id: 'd1', weekStart: '2026-08-17', visibleFrom: '2026-08-17', citations: [], approved: false, createdAt: new Date(),
    sessions: [{ date: '2026-08-20', type: 'Endurance' as const, durationMinutes: 60, zone: 'Z2', note: null }],
  };

  it('a recorded session during an open injury carries the injury icon, signal-coloured, with the name in its label; a proposed session carries none', () => {
    const html = render({ sessions: [session({ date: '2026-08-19' })], health: [injury], proposal: { kind: 'proposal', draft } });
    expect(html).toMatch(/data-mark="injury"[^>]*data-open="true"/);
    expect(html).toContain('left knee');
    // Label and tooltip both (the ruling): the chip's title names the mark.
    expect(html).toContain('title="Long ride · markInjury: left knee"');
    expect(html).toContain('data-proposed');
    expect(html.match(/data-mark=/g)).toHaveLength(1);
  });

  it('after the injury closes, the same session keeps the icon, muted', () => {
    const html = render({ sessions: [session({ date: '2026-08-19' })], health: [{ ...injury, to: '2026-08-20' }] });
    expect(html).toMatch(/data-mark="injury"[^>]*data-open="false"/);
  });

  it('a session on an illness day carries the illness icon; a session before it carries nothing', () => {
    expect(render({ sessions: [session({ date: '2026-08-19' })], health: [illness] })).toMatch(/data-mark="illness"/);
    expect(render({ sessions: [session({ date: '2026-08-17' })], health: [illness] })).not.toContain('data-mark=');
  });

  it('marks the collapsed week’s dots too, tooltip included', () => {
    // Session in the week of the 10th, collapsed (today is in the week of the 17th).
    const html = render({ sessions: [session({ date: '2026-08-12' })], health: [injury] });
    expect(html).toMatch(/data-mark="injury"/);
    // The dot's title names the mark as the expanded chip's does (CodeRabbit, PR #86).
    expect(html).toContain('title="Long ride · markInjury: left knee"');
  });

  it('a marked chip that cannot be lifted still announces why (CodeRabbit, PR #86)', () => {
    const html = render({ sessions: [session({ date: '2026-08-19', parked: true })], health: [injury] });
    const chip = html.match(/<button[^>]*Long ride · markInjury[^>]*>/)?.[0] ?? '';
    expect(chip).toMatch(/aria-label="[^"]*bounceParked[^"]*"/);
  });

  it('shows the two statuses on every week — healthy/uninjured on a clean week — and the band and chip are gone', () => {
    const clean = render({});
    expect(clean).toContain('data-health-status');
    expect(clean).toContain('statusHealthy');
    expect(clean).toContain('statusUninjured');
    expect(clean).not.toMatch(/data-active="true"/);
    const hurt = render({ health: [injury, illness] });
    expect(hurt).toMatch(/data-status="injury"[^>]*data-active="true"/);
    expect(hurt).toMatch(/data-status="illness"[^>]*data-active="true"/);
    expect(hurt).toContain('statusInjured');
    expect(hurt).toContain('statusIll');
    expect(hurt).not.toContain('data-health-day');
    expect(hurt).not.toContain('data-health-chip');
  });

  it('reads the current state: a healed record leaves every week’s status clean, an open one lights every week it touches', () => {
    const weekOf = (html: string, start: string) =>
      html.match(new RegExp(`data-health-status="${start}"[^>]*>[^]*?</div>`))?.[0] ?? '';
    // Ran 1–10 Aug, healed: the week of the 10th keeps its marks, its status reads uninjured.
    const healed = render({ health: [{ ...injury, to: '2026-08-10' }] });
    expect(weekOf(healed, '2026-08-10')).not.toMatch(/data-active="true"/);
    expect(weekOf(healed, '2026-08-17')).not.toMatch(/data-active="true"/);
    // Still open since 1 Aug: both weeks read injured (the boundary before it is weekStatus's own test).
    const open = render({ health: [injury] });
    expect(weekOf(open, '2026-08-10')).toMatch(/data-status="injury"[^>]*data-active="true"/);
    expect(weekOf(open, '2026-08-17')).toMatch(/data-status="injury"[^>]*data-active="true"/);
  });

  it('offers "How’s your body?" to the athlete whether or not anything is open, and never to the Head Coach', () => {
    expect(render()).toContain('healthButton');
    expect(render({ health: [injury] })).toContain('healthButton');
    expect(render({ readOnly: true, coachAthleteId: 'a1', health: [injury] })).not.toContain('healthButton');
  });

  it('gives the Head Coach the same marks when the athlete shares them', () => {
    const html = render({ readOnly: true, coachAthleteId: 'a1', sessions: [session({ date: '2026-08-19' })], health: [injury, illness] });
    expect(html).toMatch(/data-mark="injury"/);
    expect(html).toMatch(/data-mark="illness"/);
  });
});

describe('the weekday header (showable-version/25)', () => {
  it('is built from UTC-midnight dates: Monday first when formatted in UTC or east of it — and the reason the formatter must be pinned', () => {
    // On Vercel the server is UTC and the browser east of it; a local-midnight
    // Date formatted in another zone was Sunday (Mads, production, 2026-09-17).
    expect(HEADER_DAYS).toHaveLength(7);
    expect(HEADER_DAYS.map((d) => d.getUTCDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
    for (const timeZone of ['UTC', 'Europe/Copenhagen']) {
      expect(new Intl.DateTimeFormat('da', { weekday: 'short', timeZone }).format(HEADER_DAYS[0])).toBe('man.');
      expect(new Intl.DateTimeFormat('en', { weekday: 'short', timeZone }).format(HEADER_DAYS[0])).toBe('Mon');
    }
    // West of UTC the same instant is still Sunday evening — which is why the
    // component formats these in UTC and never in whatever zone it runs in.
    expect(new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'America/Los_Angeles' }).format(HEADER_DAYS[0])).toBe('Sun');
  });

  it('formats the labels with timeZone UTC, never the server’s zone', () => {
    dateTime.mockClear();
    render({});
    const headerCalls = dateTime.mock.calls.filter(([d]) => HEADER_DAYS.includes(d as Date));
    expect(headerCalls).toHaveLength(7);
    for (const [, opts] of headerCalls) expect(opts).toMatchObject({ weekday: 'short', timeZone: 'UTC' });
  });
});
