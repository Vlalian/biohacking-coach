import { describe, it, expect } from 'vitest';
import {
  RETIRED_PERSONA_LABELS,
  describeRetirement,
  parseRetireArgs,
  planRetirement,
  type PersonaRow,
} from './retire-personas';

/**
 * The decisions behind `scripts/retire-personas.ts` (code-health/13, 18),
 * kept out of the script so they can be held to a test without a database.
 *
 * Since 18 the personas are found by label, not by id: every tester Head
 * Coach holds their own copy of Alex, Sam and Nadia at ids derived from the
 * coach, so the set of ids is open and the labels are the closed list.
 */

const row = (over: Partial<PersonaRow> = {}): PersonaRow => ({
  id: 'id-1',
  syntheticLabel: 'Alex Rivera',
  userId: null,
  sessions: 40,
  links: 2,
  ...over,
});

describe('RETIRED_PERSONA_LABELS', () => {
  it('lists the labels it retires: the three personas and the Test Athlete', () => {
    expect(RETIRED_PERSONA_LABELS).toEqual(['Alex Rivera', 'Sam Chen', 'Nadia Holm', 'Test Athlete']);
  });
});

describe('parseRetireArgs', () => {
  it('is a dry run unless --yes is given', () => {
    expect(parseRetireArgs([])).toEqual({ yes: false });
    expect(parseRetireArgs(['--yes'])).toEqual({ yes: true });
  });

  it('passes --production through to the guard', () => {
    expect(parseRetireArgs(['--yes', '--production'])).toEqual({ yes: true });
    expect(parseRetireArgs(['--production'])).toEqual({ yes: false });
  });

  it('refuses an argument it does not know rather than ignoring it', () => {
    expect(parseRetireArgs(['--force'])).toEqual({ error: 'unknown argument: --force' });
    expect(parseRetireArgs(['--yes', 'extra'])).toEqual({ error: 'unknown argument: extra' });
  });
});

describe('planRetirement', () => {
  it('erases every unowned copy it was handed, and has no notion of absent ids', () => {
    const rows = [row({ id: 'id-1', syntheticLabel: 'Nadia Holm' }), row({ id: 'id-2', syntheticLabel: 'Nadia Holm' })];
    const plan = planRetirement(rows);
    expect(plan.erase.map((r) => r.id)).toEqual(['id-1', 'id-2']);
    expect(plan.refused).toEqual([]);
    expect(plan).not.toHaveProperty('absent');
  });

  it('an empty database plans nothing', () => {
    expect(planRetirement([])).toEqual({ erase: [], refused: [] });
  });

  it('refuses a row that belongs to a real person, and then erases nothing at all', () => {
    // A persona has no user — that is what `athlete_identity_source` enforces.
    // A labelled row with a user_id cannot exist by that rule, but if the
    // query ever returned one, this script deletes nobody real: the whole run
    // is refused, not just the row.
    const real = row({ id: 'id-3', syntheticLabel: 'Sam Chen', userId: 'u1' });
    const plan = planRetirement([row(), real]);
    expect(plan.refused).toEqual([real]);
    expect(plan.erase).toEqual([]);
  });
});

describe('describeRetirement', () => {
  it('prints what each row carries, so the cascade is visible before it runs', () => {
    const lines = describeRetirement(planRetirement([row({ sessions: 12, links: 1 })]), false);
    expect(lines[0]).toBe('erase  Alex Rivera (id-1): 12 session(s), 1 Coaching Link(s)');
  });

  it('counts the copies per label', () => {
    const plan = planRetirement([
      row({ id: 'id-1', syntheticLabel: 'Nadia Holm' }),
      row({ id: 'id-2', syntheticLabel: 'Nadia Holm' }),
      row({ id: 'id-3', syntheticLabel: 'Alex Rivera' }),
    ]);
    const lines = describeRetirement(plan, false);
    expect(lines).toContain('Nadia Holm: 2 copies');
    expect(lines).toContain('Alex Rivera: 1 copy');
    expect(lines).not.toContainEqual(expect.stringMatching(/^Sam Chen/));
  });

  it('counts rows without a label together, under a question mark, rather than dropping them', () => {
    const rows = [row({ id: 'id-8', syntheticLabel: null }), row({ id: 'id-9', syntheticLabel: null })];
    const lines = describeRetirement(planRetirement(rows), false);
    expect(lines).toContain('?: 2 copies');
  });

  it('ends a dry run by saying how to make it real', () => {
    const lines = describeRetirement(planRetirement([row()]), false);
    expect(lines.at(-1)).toBe('dry run: 1 athlete row(s) would be erased. Re-run with --yes.');
  });

  it('ends a real run by saying what it is about to do', () => {
    const lines = describeRetirement(planRetirement([row(), row({ id: 'id-2' })]), true);
    expect(lines.at(-1)).toBe('erasing 2 athlete row(s) and everything that cascades from them.');
  });

  it('names a refused row and erases nothing, with or without --yes', () => {
    const real = row({ syntheticLabel: null, userId: 'user-1' });
    for (const yes of [false, true]) {
      const lines = describeRetirement(planRetirement([real]), yes);
      expect(lines[0]).toBe('REFUSE id-1 — has a user (user-1); not a persona');
      expect(lines.at(-1)).toBe('refused at least one row; nothing erased.');
    }
  });
});
