// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Action Proposal card as its two hosts drive it (`training-architecture/20`).
 * What each outcome does to the card is pinned in `plan-decision.test.ts`; this
 * pins the wiring: which server call a tap makes, what the card shows after,
 * and whether the page is refreshed and the host told.
 */

const { commitWeeklyPlanAction, declineWeeklyPlanAction, refresh } = vi.hoisted(() => ({
  commitWeeklyPlanAction: vi.fn(),
  declineWeeklyPlanAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('./weekly-actions', () => ({ commitWeeklyPlanAction, declineWeeklyPlanAction }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { usePlanDecision } = await import('./use-plan-decision');

const PLAN = { sessions: [{ date: '2026-09-18', type: 'Endurance', durationMinutes: 40, zone: 'Z2', note: null }] };
const OTHER = { sessions: [{ date: '2026-09-19', type: 'Intensity', durationMinutes: 30, zone: 'Z4', note: null }] };
const IDLE = { proposal: null, popupOpen: false, notice: { kind: 'none' } };

type Params = Parameters<typeof usePlanDecision>[0];
const hook = (params: Partial<Params> = {}) =>
  renderHook(() => usePlanDecision({ conversationId: 'conv_1', initial: PLAN, ...params }));

/** The part of the hook's return a host renders. */
const card = (r: { current: ReturnType<typeof usePlanDecision> }) => ({
  proposal: r.current.proposal,
  popupOpen: r.current.popupOpen,
  notice: r.current.notice,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('what the card opens on', () => {
  it('a pending proposal comes back up in the popup', () => {
    const { result } = hook();
    expect(card(result)).toEqual({ proposal: PLAN, popupOpen: true, notice: { kind: 'none' } });
    expect(result.current.pending).toBe(false);
  });

  it('nothing pending opens on nothing', () => {
    const { result } = hook({ initial: null });
    expect(card(result)).toEqual(IDLE);
  });
});

describe('confirm — the tap that writes the week', () => {
  it('writes the week for this conversation, clears the card, tells the host and refreshes the page', async () => {
    commitWeeklyPlanAction.mockResolvedValue({ ok: true, sessionCount: 3 });
    const onCommitted = vi.fn();
    const { result } = hook({ onCommitted });

    await act(async () => result.current.confirm());

    expect(commitWeeklyPlanAction).toHaveBeenCalledWith('conv_1');
    expect(card(result)).toEqual({ proposal: null, popupOpen: false, notice: { kind: 'planned', count: 3 } });
    expect(onCommitted).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('works for a host with no consequence of its own (Coach Chat)', async () => {
    commitWeeklyPlanAction.mockResolvedValue({ ok: true, sessionCount: 2 });
    const { result } = hook();

    await act(async () => result.current.confirm());

    expect(card(result).notice).toEqual({ kind: 'planned', count: 2 });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('a refused write keeps the card, tells nobody, and leaves the page alone', async () => {
    commitWeeklyPlanAction.mockResolvedValue({ ok: false, reason: 'stale' });
    const onCommitted = vi.fn();
    const { result } = hook({ onCommitted });

    await act(async () => result.current.confirm());

    expect(card(result)).toEqual({ proposal: PLAN, popupOpen: false, notice: { kind: 'stale' } });
    expect(onCommitted).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('with no conversation yet there is nothing to write, so nothing is called', async () => {
    const { result } = hook({ conversationId: null });

    await act(async () => result.current.confirm());

    expect(commitWeeklyPlanAction).not.toHaveBeenCalled();
    expect(card(result)).toEqual({ proposal: PLAN, popupOpen: true, notice: { kind: 'none' } });
  });

  it('is pending while the write is in flight', async () => {
    let finish!: (r: { ok: true; sessionCount: number }) => void;
    commitWeeklyPlanAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = hook();

    act(() => result.current.confirm());
    expect(result.current.pending).toBe(true);

    await act(async () => finish({ ok: true, sessionCount: 1 }));
    expect(result.current.pending).toBe(false);
  });
});

describe('cancel — the athlete declines', () => {
  it('declines for this conversation, clears the card and refreshes the calendar pointer', async () => {
    declineWeeklyPlanAction.mockResolvedValue({ ok: true });
    const { result } = hook();

    await act(async () => result.current.cancel());

    expect(declineWeeklyPlanAction).toHaveBeenCalledWith('conv_1');
    expect(card(result)).toEqual(IDLE);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('a refused decline keeps the card with an error, and leaves the page alone', async () => {
    declineWeeklyPlanAction.mockResolvedValue({ ok: false, reason: 'not-owner' });
    const { result } = hook();

    await act(async () => result.current.cancel());

    expect(card(result)).toEqual({ proposal: PLAN, popupOpen: true, notice: { kind: 'error' } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('with no conversation yet there is nothing to decline', async () => {
    const { result } = hook({ conversationId: null });

    await act(async () => result.current.cancel());

    expect(declineWeeklyPlanAction).not.toHaveBeenCalled();
    expect(card(result)).toEqual({ proposal: PLAN, popupOpen: true, notice: { kind: 'none' } });
  });
});

describe('the card between decisions', () => {
  it('keepTalking drops the popup to the bar; review brings it back', () => {
    const { result } = hook();

    act(() => result.current.keepTalking());
    expect(card(result)).toEqual({ proposal: PLAN, popupOpen: false, notice: { kind: 'none' } });

    act(() => result.current.review());
    expect(card(result)).toEqual({ proposal: PLAN, popupOpen: true, notice: { kind: 'none' } });
  });

  it('receive puts a fresh proposal up, and a turn without one changes nothing', () => {
    const { result } = hook();
    act(() => result.current.keepTalking());

    act(() => result.current.receive(null));
    expect(card(result)).toEqual({ proposal: PLAN, popupOpen: false, notice: { kind: 'none' } });

    act(() => result.current.receive(OTHER));
    expect(card(result)).toEqual({ proposal: OTHER, popupOpen: true, notice: { kind: 'none' } });
  });

  it('reset clears the table for a fresh conversation', () => {
    const { result } = hook();
    act(() => result.current.reset());
    expect(card(result)).toEqual(IDLE);
  });
});
