import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveHeadCoachId, saveCoachLayout } = vi.hoisted(() => ({
  resolveHeadCoachId: vi.fn(),
  saveCoachLayout: vi.fn(),
}));

vi.mock('../../../../current-actor', () => ({ resolveHeadCoachId }));
vi.mock('@/features/coach/save-coach-layout', () => ({ saveCoachLayout }));

const { saveCoachLayoutAction } = await import('./coach-layout-actions');

/**
 * The trap this guards is a real one: the coach edits Favorites while looking
 * at an athlete's Information View, on a page whose whole context is that
 * athlete. The preference belongs to the *coach* — one roster-wide layout, ADR
 * 0004 — so the athlete id in scope must not leak into the write.
 */
const COACH = 'coach_1';

beforeEach(() => {
  resolveHeadCoachId.mockReset();
  saveCoachLayout.mockReset();
});

describe('saveCoachLayoutAction', () => {
  it('writes the coach row, never the athlete being viewed', async () => {
    resolveHeadCoachId.mockResolvedValue(COACH);
    saveCoachLayout.mockResolvedValue({ ok: true });

    const result = await saveCoachLayoutAction(['sleep'], 'r4');

    expect(result).toEqual({ ok: true });
    expect(saveCoachLayout).toHaveBeenCalledWith(COACH, ['sleep'], 'r4');
  });

  it('refuses anyone without a coach row, without writing', async () => {
    // Signed out and signed-in-but-not-a-coach deliberately give the same
    // answer: there is no Roster layout to write either way, and telling them
    // apart would leak whether an account exists.
    resolveHeadCoachId.mockResolvedValue(null);

    const result = await saveCoachLayoutAction(['sleep'], 'r4');

    expect(result).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(saveCoachLayout).not.toHaveBeenCalled();
  });
});
