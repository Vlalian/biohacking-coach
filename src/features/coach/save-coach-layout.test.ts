import { describe, it, expect, vi, beforeEach } from 'vitest';

const { updateCoachInformationViewLayout } = vi.hoisted(() => ({
  updateCoachInformationViewLayout: vi.fn(() => Promise.resolve()),
}));
vi.mock('./coach-repository', () => ({ updateCoachInformationViewLayout }));

const { saveCoachLayout } = await import('./save-coach-layout');

beforeEach(() => updateCoachInformationViewLayout.mockClear());

describe('saveCoachLayout — same catalog rule, coach row destination', () => {
  it('persists a legal layout to the coach row', async () => {
    const result = await saveCoachLayout('coach_1', ['load', 'bodymind'], 'r12');
    expect(result).toEqual({ ok: true });
    expect(updateCoachInformationViewLayout).toHaveBeenCalledWith('coach_1', {
      favorites: ['load', 'bodymind'],
      range: 'r12',
    });
  });

  it('refuses an invalid layout without writing', async () => {
    const result = await saveCoachLayout('coach_1', ['not-a-panel'], 'all');
    expect(result).toEqual({ ok: false, reason: 'invalid-layout' });
    expect(updateCoachInformationViewLayout).not.toHaveBeenCalled();
  });
});
