import { describe, it, expect } from 'vitest';
import { performCoachActions } from './coach-action-handlers';

function recorder() {
  const opened: string[] = [];
  return { opened, ctx: { openView: (view: string) => void opened.push(view) } };
}

describe('performCoachActions — open_view', () => {
  it('opens nothing when the payload carries no string View', () => {
    for (const payload of [{}, { view: 3 }, { view: null }, { view: undefined }]) {
      const { opened, ctx } = recorder();
      performCoachActions([{ name: 'open_view', durability: 'ephemeral', payload }], ctx);
      expect(opened).toEqual([]);
    }
  });

  it('opens each View in action order', () => {
    const { opened, ctx } = recorder();
    performCoachActions(
      [
        { name: 'open_view', durability: 'ephemeral', payload: { view: 'glossary' } },
        { name: 'open_view', durability: 'ephemeral', payload: { view: 'privacy' } },
      ],
      ctx,
    );
    expect(opened).toEqual(['glossary', 'privacy']);
  });

  it('opens the empty-string View as given rather than skipping it', () => {
    const { opened, ctx } = recorder();
    performCoachActions([{ name: 'open_view', durability: 'ephemeral', payload: { view: '' } }], ctx);
    expect(opened).toEqual(['']);
  });

  it('skips an inherited object member named like an action', () => {
    const { opened, ctx } = recorder();
    expect(() =>
      performCoachActions([{ name: 'toString', durability: 'ephemeral', payload: {} }], ctx),
    ).not.toThrow();
    expect(opened).toEqual([]);
  });
});
