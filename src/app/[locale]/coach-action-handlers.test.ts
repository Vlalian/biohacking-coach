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

  it('performs only ephemeral actions: a durable one is never run, even with a handler for its name', () => {
    const opened: string[] = [];
    performCoachActions(
      [
        { name: 'open_view', durability: 'durable', payload: { view: 'privacy' } },
        { name: 'open_view', durability: 'ephemeral', payload: { view: 'settings' } },
      ],
      { openView: (view) => void opened.push(view) },
    );
    expect(opened).toEqual(['settings']);
  });

  it('does nothing for an empty list', () => {
    const opened: string[] = [];
    performCoachActions([], { openView: (view) => void opened.push(view) });
    expect(opened).toEqual([]);
  });
});
