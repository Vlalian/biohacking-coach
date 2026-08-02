import { describe, it, expect, vi, beforeEach } from 'vitest';

const { updateInformationViewLayout } = vi.hoisted(() => ({
  updateInformationViewLayout: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/features/athlete/athlete-repository', () => ({
  updateInformationViewLayout,
}));

const { saveLayout } = await import('./save-layout');

beforeEach(() => {
  updateInformationViewLayout.mockClear();
});

describe('saveLayout — layout persistence', () => {
  it('persists a legal layout for the given athlete', async () => {
    const result = await saveLayout('athlete_1', ['sleep', 'ffnow'], 'r4');
    expect(result).toEqual({ ok: true });
    expect(updateInformationViewLayout).toHaveBeenCalledWith('athlete_1', {
      favorites: ['sleep', 'ffnow'],
      range: 'r4',
    });
  });

  it('an emptied Favorites list is legal — demote-only, never forced back to default', async () => {
    expect(await saveLayout('athlete_1', [], 'all')).toEqual({ ok: true });
  });

  const illegal: Array<[string, unknown, unknown]> = [
    ['favorites not an array', 'sleep', 'all'],
    ['an unknown panel id', ['sleep', 'retired-panel'], 'all'],
    ['a non-string member', ['sleep', 7], 'all'],
    ['a duplicated id', ['sleep', 'sleep'], 'all'],
    ['an unknown range', ['sleep'], 'r99'],
    ['a non-string range', ['sleep'], 4],
  ];
  for (const [name, favorites, range] of illegal) {
    it(`refuses ${name} without writing`, async () => {
      const result = await saveLayout('athlete_1', favorites, range);
      expect(result).toEqual({ ok: false, reason: 'invalid-layout' });
      expect(updateInformationViewLayout).not.toHaveBeenCalled();
    });
  }
});
