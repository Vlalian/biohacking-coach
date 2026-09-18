import { describe, it, expect } from 'vitest';
import {
  RETIRED_PERSONA_IDS,
  describeRetirement,
  parseRetireArgs,
  planRetirement,
  type PersonaRow,
} from './retire-personas';
import { SYNTHETIC_PROFILES } from './synthetic-history';

/**
 * The decisions behind `scripts/retire-personas.ts` (code-health/13), kept out
 * of the script so they can be held to a test without a database.
 */

const row = (over: Partial<PersonaRow> = {}): PersonaRow => ({
  id: RETIRED_PERSONA_IDS[0],
  syntheticLabel: 'Alex Rivera',
  userId: null,
  sessions: 40,
  links: 2,
  ...over,
});

describe('RETIRED_PERSONA_IDS', () => {
  it('names the two generated personas and the shallow Test Athlete', () => {
    for (const p of SYNTHETIC_PROFILES) expect(RETIRED_PERSONA_IDS).toContain(p.id);
    expect(RETIRED_PERSONA_IDS).toContain('eff4e0bc-d603-4d5e-8ae5-369ff5bb1213');
    expect(RETIRED_PERSONA_IDS).toHaveLength(4);
    expect(new Set(RETIRED_PERSONA_IDS).size).toBe(4);
  });
});

describe('parseRetireArgs', () => {
  it('is a dry run unless --yes is given', () => {
    expect(parseRetireArgs([])).toEqual({ yes: false });
    expect(parseRetireArgs(['--yes'])).toEqual({ yes: true });
  });

  it('refuses an argument it does not know rather than ignoring it', () => {
    expect(parseRetireArgs(['--force'])).toEqual({ error: 'unknown argument: --force' });
    expect(parseRetireArgs(['--yes', 'extra'])).toEqual({ error: 'unknown argument: extra' });
  });
});

describe('planRetirement', () => {
  it('erases every persona row it found', () => {
    const found = RETIRED_PERSONA_IDS.map((id) => row({ id }));
    const plan = planRetirement(found);
    expect(plan.erase.map((r) => r.id)).toEqual([...RETIRED_PERSONA_IDS]);
    expect(plan.absent).toEqual([]);
    expect(plan.refused).toEqual([]);
  });

  it('lists the ids that are already gone, so a second run is a no-op that says so', () => {
    const plan = planRetirement([row({ id: RETIRED_PERSONA_IDS[1] })]);
    expect(plan.erase.map((r) => r.id)).toEqual([RETIRED_PERSONA_IDS[1]]);
    expect(plan.absent).toEqual([RETIRED_PERSONA_IDS[0], RETIRED_PERSONA_IDS[2], RETIRED_PERSONA_IDS[3]]);
  });

  it('refuses a row that belongs to a real person, whatever id it sits under', () => {
    // A persona has no user — that is what `athlete_identity_source` enforces.
    // A row at one of these ids with a user_id is a real athlete, and this
    // script deletes nobody real; the whole run is refused, not just the row.
    const real = row({ id: RETIRED_PERSONA_IDS[2], syntheticLabel: null, userId: 'user-1' });
    const plan = planRetirement([row(), real]);
    expect(plan.refused).toEqual([real]);
    expect(plan.erase).toEqual([]);
  });
});

describe('describeRetirement', () => {
  it('prints what each row carries, so the cascade is visible before it runs', () => {
    const plan = planRetirement([row({ sessions: 12, links: 1 })]);
    const lines = describeRetirement(plan, false);
    expect(lines[0]).toBe(
      `erase  Alex Rivera (${RETIRED_PERSONA_IDS[0]}): 12 session(s), 1 Coaching Link(s)`,
    );
    expect(lines).toContain(`absent ${RETIRED_PERSONA_IDS[1]} — already gone`);
    expect(lines).toContain(`absent ${RETIRED_PERSONA_IDS[2]} — already gone`);
  });

  it('ends a dry run by saying how to make it real', () => {
    const lines = describeRetirement(planRetirement([row()]), false);
    expect(lines.at(-1)).toBe('dry run: 1 athlete row(s) would be erased. Re-run with --yes.');
  });

  it('ends a real run by saying what it is about to do', () => {
    const lines = describeRetirement(planRetirement([row(), row({ id: RETIRED_PERSONA_IDS[1] })]), true);
    expect(lines.at(-1)).toBe('erasing 2 athlete row(s) and everything that cascades from them.');
  });

  it('names a refused row and erases nothing, with or without --yes', () => {
    const real = row({ syntheticLabel: null, userId: 'user-1' });
    for (const yes of [false, true]) {
      const lines = describeRetirement(planRetirement([real]), yes);
      expect(lines[0]).toBe(`REFUSE ${RETIRED_PERSONA_IDS[0]} — has a user (user-1); not a persona`);
      expect(lines.at(-1)).toBe('refused at least one row; nothing erased.');
    }
  });
});
