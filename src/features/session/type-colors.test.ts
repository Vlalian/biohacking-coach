import { describe, it, expect } from 'vitest';
import { FILTERABLE_TYPES, PRESCRIBABLE_TYPES } from './type-colors';

/**
 * The Session Type lists — pinned because two surfaces read them and a silent
 * drift between the two is invisible until a coach hits it.
 *
 * The colours in this module are deliberately not asserted: a hex value is a
 * design choice with no behaviour to specify, and a test that restated it would
 * only make changing it more annoying. These lists are different — they decide
 * what a Head Coach is *offered*, which is behaviour.
 */
describe('PRESCRIBABLE_TYPES', () => {
  it('is the plannable types plus Rest and Strength, in that order', () => {
    // Pinned exactly. `PrescribePanel` (adding a session) and the Session
    // Drawer (editing one) both render this list, and until 2026-09-08 each
    // built its own copy — so a type added to one and not the other was a
    // one-line change away. The list is the contract between them.
    expect(PRESCRIBABLE_TYPES).toEqual([
      'Endurance',
      'Intensity',
      'Tempo',
      'Recovery',
      'Rest',
      'Strength',
    ]);
  });

  it('extends the filterable types rather than restating them', () => {
    // The relationship, not just the contents: a type added to FILTERABLE_TYPES
    // must reach the prescribe surfaces too, and this fails if the spread is
    // ever replaced by a literal list that happens to match today.
    expect(PRESCRIBABLE_TYPES.slice(0, FILTERABLE_TYPES.length)).toEqual(FILTERABLE_TYPES);
    expect(PRESCRIBABLE_TYPES).toHaveLength(FILTERABLE_TYPES.length + 2);
  });
});
