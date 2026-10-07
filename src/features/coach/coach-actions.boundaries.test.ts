import { describe, it, expect } from 'vitest';
import {
  COACH_ACTION_CATALOG,
  actionsFromToolCalls,
  coachActionTools,
  isCoachActionCall,
  validateCoachAction,
  type CoachActionDefinition,
} from './coach-actions';

// Pure module: every test calls it directly with a catalog it builds itself.

const WIDGET: CoachActionDefinition = {
  name: 'set_widget',
  description: 'Set the widget.',
  durability: 'durable',
  payload: {
    level: { kind: 'integer', min: 2, max: 5, description: 'The level.' },
    label: { kind: 'string', description: 'The label.' },
    colour: { kind: 'enum', values: ['red', 'blue'], description: 'The colour.' },
  },
};

const PING: CoachActionDefinition = {
  name: 'ping',
  description: 'Ping.',
  durability: 'ephemeral',
  payload: {},
};

const CATALOG = [WIDGET, PING];

const validWidget = { level: 3, label: 'x', colour: 'red' };

describe('integer fields', () => {
  it('accepts both ends of the declared range', () => {
    for (const level of [2, 5]) {
      expect(validateCoachAction({ name: 'set_widget', input: { ...validWidget, level } }, CATALOG)).toMatchObject({
        ok: true,
        action: { payload: { level } },
      });
    }
  });

  it('refuses a value one past either end as out of range', () => {
    for (const level of [1, 6]) {
      expect(validateCoachAction({ name: 'set_widget', input: { ...validWidget, level } }, CATALOG)).toEqual({
        ok: false,
        reason: 'out-of-range',
      });
    }
  });

  it('refuses a fraction, a numeric string and a missing value as malformed', () => {
    for (const level of [2.5, '3', undefined, NaN]) {
      expect(validateCoachAction({ name: 'set_widget', input: { ...validWidget, level } }, CATALOG)).toEqual({
        ok: false,
        reason: 'malformed',
      });
    }
  });
});

describe('string fields', () => {
  it('accepts any string, the empty one included', () => {
    for (const label of ['', 'hello']) {
      expect(validateCoachAction({ name: 'set_widget', input: { ...validWidget, label } }, CATALOG)).toMatchObject({
        ok: true,
        action: { payload: { label } },
      });
    }
  });

  it('refuses a non-string as malformed', () => {
    for (const label of [1, null, undefined, {}]) {
      expect(validateCoachAction({ name: 'set_widget', input: { ...validWidget, label } }, CATALOG)).toEqual({
        ok: false,
        reason: 'malformed',
      });
    }
  });
});

describe('enum fields', () => {
  it('refuses a non-string as malformed and an unlisted string as out of range', () => {
    expect(validateCoachAction({ name: 'set_widget', input: { ...validWidget, colour: 1 } }, CATALOG)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(validateCoachAction({ name: 'set_widget', input: { ...validWidget, colour: 'green' } }, CATALOG)).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });
});

describe('a payload with several fields', () => {
  it('returns every declared field and drops the undeclared ones', () => {
    expect(
      validateCoachAction({ name: 'set_widget', input: { ...validWidget, extra: 'no' } }, CATALOG),
    ).toEqual({
      ok: true,
      action: { name: 'set_widget', durability: 'durable', payload: validWidget },
    });
  });
});

describe('an entry with an empty payload', () => {
  it('accepts an object input and returns an empty payload', () => {
    expect(validateCoachAction({ name: 'ping', input: {} }, CATALOG)).toEqual({
      ok: true,
      action: { name: 'ping', durability: 'ephemeral', payload: {} },
    });
  });

  it('refuses null, an array and a primitive as malformed', () => {
    for (const input of [null, [], 'ping', 7, undefined]) {
      expect(validateCoachAction({ name: 'ping', input }, CATALOG)).toEqual({ ok: false, reason: 'malformed' });
    }
  });
});

describe('isCoachActionCall', () => {
  it('is true for a name in the catalog, valid input or not', () => {
    expect(isCoachActionCall({ name: 'open_view', input: null })).toBe(true);
    expect(isCoachActionCall({ name: 'set_widget', input: {} }, CATALOG)).toBe(true);
  });

  it('is false for a name outside the catalog', () => {
    expect(isCoachActionCall({ name: 'set_widget', input: {} })).toBe(false);
    expect(isCoachActionCall({ name: 'propose_week_plan', input: {} })).toBe(false);
    expect(isCoachActionCall({ name: '', input: {} }, CATALOG)).toBe(false);
  });
});

describe('coachActionTools', () => {
  it('generates each field schema from its declared shape and requires every field', () => {
    const tool = coachActionTools(CATALOG).find((t) => t.name === 'set_widget')!;
    expect(tool.description).toBe('Set the widget.');
    expect(tool.input_schema).toEqual({
      type: 'object',
      properties: {
        level: { type: 'integer', minimum: 2, maximum: 5, description: 'The level.' },
        label: { type: 'string', description: 'The label.' },
        colour: { type: 'string', enum: ['red', 'blue'], description: 'The colour.' },
      },
      required: ['level', 'label', 'colour'],
      additionalProperties: false,
    });
  });

  it('gives an empty-payload entry an empty schema', () => {
    const tool = coachActionTools(CATALOG).find((t) => t.name === 'ping')!;
    expect(tool.input_schema).toEqual({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    });
  });

  it('carries the description of the shipped open_view entry', () => {
    const tool = coachActionTools().find((t) => t.name === 'open_view')!;
    const entry = COACH_ACTION_CATALOG.find((e) => e.name === 'open_view')!;
    expect(tool.description).toBe(entry.description);
    expect(tool.description).toMatch(/only when the athlete asks/i);
    expect(
      (tool.input_schema as unknown as { properties: { view: { description: string } } }).properties.view
        .description,
    ).toBe('The View to open.');
  });
});

describe('actionsFromToolCalls over a custom catalog', () => {
  it('keeps call order across entries and drops refused calls', () => {
    expect(
      actionsFromToolCalls(
        [
          { name: 'ping', input: {} },
          { name: 'set_widget', input: { ...validWidget, level: 9 } },
          { name: 'set_widget', input: validWidget },
        ],
        CATALOG,
      ),
    ).toEqual([
      { name: 'ping', durability: 'ephemeral', payload: {} },
      { name: 'set_widget', durability: 'durable', payload: validWidget },
    ]);
  });
});
