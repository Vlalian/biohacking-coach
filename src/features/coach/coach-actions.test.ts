import { describe, it, expect } from 'vitest';
import {
  COACH_ACTION_CATALOG,
  actionsFromToolCalls,
  coachActionTools,
  validateCoachAction,
} from './coach-actions';

// The catalog and the validator are pure: every test calls them directly with
// real inputs, no mocks.

// Research 2026-10-04-ca-02-the-coach-opens-a-view-the-coach-opens-a-view#C12:
// the payload's View list is the athlete's reachable Views, not every ViewId.
const OPENABLE = ['training-plan', 'information', 'equipment', 'glossary', 'settings', 'privacy'];

describe('the open_view tool description', () => {
  it('tells the Coach to open a View on request and still answer in words', () => {
    const entry = COACH_ACTION_CATALOG.find((e) => e.name === 'open_view')!;
    expect(entry.description).toMatch(/asks to be taken there/);
    expect(entry.description).toMatch(/still answer in words/);
  });
});

describe('the catalog declares its entries as data', () => {
  // #C1: opening a View is ephemeral; the Coach performs it, no confirmation.
  it('declares open_view with its name, durability and payload shape', () => {
    const entry = COACH_ACTION_CATALOG.find((e) => e.name === 'open_view');
    expect(entry).toBeDefined();
    expect(entry!.durability).toBe('ephemeral');
    expect(entry!.payload.view).toMatchObject({ kind: 'enum' });
    expect((entry!.payload.view as { values: string[] }).values).toEqual(OPENABLE);
  });
});

describe('validateCoachAction — a valid call becomes a typed action by catalog lookup', () => {
  it('returns the typed action, carrying the durability the entry declares', () => {
    expect(validateCoachAction({ name: 'open_view', input: { view: 'settings' } })).toEqual({
      ok: true,
      action: { name: 'open_view', durability: 'ephemeral', payload: { view: 'settings' } },
    });
  });

  it('accepts every View the athlete can reach', () => {
    for (const view of OPENABLE) {
      expect(validateCoachAction({ name: 'open_view', input: { view } })).toMatchObject({ ok: true });
    }
  });

  // #C3: an action carries selection, never content.
  it('keeps only the declared payload fields', () => {
    const result = validateCoachAction({ name: 'open_view', input: { view: 'settings', note: 'hi' } });
    expect(result).toEqual({
      ok: true,
      action: { name: 'open_view', durability: 'ephemeral', payload: { view: 'settings' } },
    });
  });
});

describe('validateCoachAction — the set is closed', () => {
  // #C2
  it('refuses an action name outside the catalog', () => {
    expect(validateCoachAction({ name: 'delete_everything', input: {} })).toEqual({
      ok: false,
      reason: 'unknown-action',
    });
    expect(validateCoachAction({ name: 'propose_week_plan', input: {} })).toEqual({
      ok: false,
      reason: 'unknown-action',
    });
  });
});

describe('validateCoachAction — a malformed or out-of-range payload is refused with a reason', () => {
  it('refuses a payload that is not the declared shape', () => {
    for (const input of [null, 'settings', [], {}, { view: 3 }]) {
      expect(validateCoachAction({ name: 'open_view', input })).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  // #C12: roster, messaging and feedback are real refusal cases.
  it('refuses a View the athlete cannot reach', () => {
    for (const view of ['roster', 'messaging', 'feedback', 'nowhere']) {
      expect(validateCoachAction({ name: 'open_view', input: { view } })).toEqual({
        ok: false,
        reason: 'out-of-range',
      });
    }
  });

  it('surfaces no action for a refused call', () => {
    expect(
      actionsFromToolCalls([
        { name: 'open_view', input: { view: 'roster' } },
        { name: 'open_view', input: null },
        { name: 'made_up', input: {} },
      ]),
    ).toEqual([]);
  });
});

describe('actionsFromToolCalls', () => {
  it('returns the valid actions in call order and drops the rest', () => {
    expect(
      actionsFromToolCalls([
        { name: 'open_view', input: { view: 'glossary' } },
        { name: 'look_up_training_science', input: { question: 'q' } },
        { name: 'open_view', input: { view: 'roster' } },
        { name: 'open_view', input: { view: 'privacy' } },
      ]),
    ).toEqual([
      { name: 'open_view', durability: 'ephemeral', payload: { view: 'glossary' } },
      { name: 'open_view', durability: 'ephemeral', payload: { view: 'privacy' } },
    ]);
  });

  it('returns an empty list when there are no calls', () => {
    expect(actionsFromToolCalls([])).toEqual([]);
  });
});

describe('a second, unrelated action needs only a catalog entry', () => {
  it('registers a durable throwaway entry and validates and surfaces it with no new branch', () => {
    const throwaway = {
      name: 'ring_bell',
      description: 'Ring the bell.',
      durability: 'durable' as const,
      payload: { times: { kind: 'integer' as const, min: 1, max: 3, description: 'How many rings.' } },
    };
    const catalog = [...COACH_ACTION_CATALOG, throwaway];

    expect(validateCoachAction({ name: 'ring_bell', input: { times: 2 } }, catalog)).toEqual({
      ok: true,
      action: { name: 'ring_bell', durability: 'durable', payload: { times: 2 } },
    });
    expect(validateCoachAction({ name: 'ring_bell', input: { times: 9 } }, catalog)).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
    expect(validateCoachAction({ name: 'ring_bell', input: { times: 'two' } }, catalog)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(coachActionTools(catalog).map((t) => t.name)).toEqual(['open_view', 'ring_bell']);
    expect(actionsFromToolCalls([{ name: 'ring_bell', input: { times: 1 } }], catalog)).toEqual([
      { name: 'ring_bell', durability: 'durable', payload: { times: 1 } },
    ]);
    // The default catalog is untouched: the throwaway is unknown there.
    expect(validateCoachAction({ name: 'ring_bell', input: { times: 1 } })).toEqual({
      ok: false,
      reason: 'unknown-action',
    });
  });
});

describe('coachActionTools — tool definitions are generated from the catalog', () => {
  it('builds one tool per entry, with the input schema generated from the payload shape', () => {
    const tools = coachActionTools();
    expect(tools).toHaveLength(COACH_ACTION_CATALOG.length);
    const tool = tools.find((t) => t.name === 'open_view')!;
    expect(tool.input_schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['view'],
      properties: { view: { type: 'string', enum: OPENABLE } },
    });
  });
});
