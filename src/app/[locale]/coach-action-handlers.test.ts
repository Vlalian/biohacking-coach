import { describe, it, expect } from 'vitest';
import { performCoachActions } from './coach-action-handlers';

describe('performCoachActions — the client performs each action through its handler', () => {
  it('runs open_view through openView and skips an action with no handler', () => {
    const opened: string[] = [];
    performCoachActions(
      [
        { name: 'open_view', durability: 'ephemeral', payload: { view: 'settings' } },
        { name: 'not_wired', durability: 'ephemeral', payload: {} },
      ],
      {
        openView: (view) => {
          opened.push(view);
        },
      },
    );
    expect(opened).toEqual(['settings']);
  });

  it('does nothing for an empty list', () => {
    const opened: string[] = [];
    performCoachActions([], { openView: (view) => void opened.push(view) });
    expect(opened).toEqual([]);
  });
});
