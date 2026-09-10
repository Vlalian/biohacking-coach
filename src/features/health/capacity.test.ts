import { describe, it, expect } from 'vitest';
import { capacityStatement, combinedCapacity, FULL_CAPACITY } from './capacity';

const CANNOT_RUN = { capacity: { swim: 'full', bike: 'full', run: 'none' } } as const;
const EASY_BIKE = { capacity: { swim: 'full', bike: 'easy', run: 'full' } } as const;

/**
 * `training-architecture/04` and [ADR 0011](../../../docs/adr/0011-an-injury-is-split-by-who-reads-it.md).
 */
describe('combinedCapacity', () => {
  it('leaves an athlete with nothing wrong unrestricted', () => {
    expect(combinedCapacity([], false)).toEqual(FULL_CAPACITY);
  });

  it('takes the most restrictive open injury per discipline, not an average', () => {
    // Two injuries do not cancel out. An athlete who cannot run and can only
    // ride easy has both of those facts true at once, and taking the gentler of
    // the two would plan training they said they cannot do.
    expect(combinedCapacity([CANNOT_RUN, EASY_BIKE], false)).toEqual({
      swim: 'full',
      bike: 'easy',
      run: 'none',
    });
  });

  it('lets an injury reshape a week rather than empty it', () => {
    // The whole reason an Injury is discipline-specific: a running injury does
    // not stop swimming, and for a triathlete that is the difference between a
    // changed week and no week.
    expect(combinedCapacity([CANNOT_RUN], false).swim).toBe('full');
    expect(combinedCapacity([CANNOT_RUN], false).bike).toBe('full');
  });

  it('lets an illness remove every discipline, whatever the injuries say', () => {
    // Systemic, not discipline-specific. An athlete with a calf strain *and* flu
    // must not be planned like an athlete with only the calf strain.
    expect(combinedCapacity([CANNOT_RUN, EASY_BIKE], true)).toEqual({
      swim: 'none',
      bike: 'none',
      run: 'none',
    });
    expect(combinedCapacity([], true)).toEqual({ swim: 'none', bike: 'none', run: 'none' });
  });
});

describe('capacityStatement — the only half a prompt ever sees', () => {
  it('says nothing at all when nothing is restricted', () => {
    // Not "everything is fine". A block on every prompt for every healthy
    // athlete is noise the model learns to skip, and this block has to be read
    // on the week it appears.
    expect(capacityStatement([], false)).toBeNull();
  });

  it('names what the athlete cannot do, in their own terms', () => {
    const statement = capacityStatement([CANNOT_RUN, EASY_BIKE], false);

    expect(statement).toContain('no run');
    expect(statement).toContain('bike easy only');
    expect(statement).not.toContain('swim');
    // Separated, not run together. Asserting each clause on its own passes just
    // as happily on "bike easy onlyno run", which is one restriction as far as
    // the model is concerned.
    expect(statement).toContain('bike easy only; no run');
  });

  it('tells the Coach this is capacity, not diagnosis', () => {
    // The posture ruling: working around an injury is IN, diagnosing one is OUT.
    // The prompt has to say so, because a model given a restriction will
    // otherwise reason about its cause.
    const statement = capacityStatement([CANNOT_RUN], false);

    expect(statement).toContain('not a diagnosis');
    expect(statement).toContain('substitute rather than cancel');
    // Both halves of the instruction, because each refuses a different mistake:
    // one stops the Coach reasoning about a cause it was never given, the other
    // stops it editing the calendar on the athlete's behalf.
    expect(statement).toContain('you have not been told');
    expect(statement).toContain('do not skip or move sessions on your own');
    // And it must not turn the athlete into the diagnostician either — "what
    // exactly is wrong with it?" is the same clinical question asked sideways.
    expect(statement).toContain('must not ask them to work it out');
  });

  it('is a named block the Coach can find', () => {
    // The prompt is a list of labelled blocks; an unlabelled sentence in the
    // middle of one reads as part of whatever came before it.
    expect(capacityStatement([CANNOT_RUN], false)).toMatch(/^CAPACITY: /);
  });

  it('distinguishes an illness from an injury in what it tells the Coach', () => {
    expect(capacityStatement([], true)).toContain('ill');
    expect(capacityStatement([CANNOT_RUN], false)).toContain('injury');
  });

  it('carries no body location, because it is given none', () => {
    // The structural guarantee, tested as one: this function's input has no
    // field for a location, so no statement it produces can contain one. "Left
    // knee" does not imply running is out — that leap is a clinical inference.
    const statement = capacityStatement([CANNOT_RUN, EASY_BIKE], false) ?? '';

    for (const location of ['knee', 'achilles', 'calf', 'shoulder', 'back', 'left', 'right']) {
      expect(statement.toLowerCase()).not.toContain(location);
    }
  });
});
