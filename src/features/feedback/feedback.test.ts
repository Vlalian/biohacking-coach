import { describe, it, expect } from 'vitest';
import { submittedFromView } from './feedback';

describe('submittedFromView', () => {
  it('keeps a View path', () => {
    expect(submittedFromView('/training-plan')).toBe('/training-plan');
    expect(submittedFromView('/coach/athlete/abc_1/plan')).toBe('/coach/athlete/abc_1/plan');
    expect(submittedFromView('/')).toBe('/');
  });

  it('refuses anything that is not shaped like a path', () => {
    // The escape hatch's own link supplies this, so it is client-supplied by
    // construction. A column read for context is worth having; a column a client
    // can write prose into is not.
    expect(submittedFromView('training-plan')).toBeNull();
    expect(submittedFromView('the calendar never loaded')).toBeNull();
    expect(submittedFromView('/path with spaces')).toBeNull();
    expect(submittedFromView('https://example.com/phish')).toBeNull();
  });

  it('refuses a path longer than a path has any reason to be', () => {
    expect(submittedFromView(`/${'a'.repeat(64)}`)).toBeNull();
    expect(submittedFromView(`/${'a'.repeat(63)}`)).not.toBeNull();
  });

  it('refuses a non-string that merely stringifies to a path', () => {
    // What the `typeof` guard is for. `RegExp.test` coerces its argument, so an
    // array holding one path-shaped string matches the pattern — and without the
    // guard it would be the array, not a string, that reached the column.
    expect(submittedFromView(['/training-plan'])).toBeNull();
    expect(submittedFromView({ toString: () => '/training-plan' })).toBeNull();
  });

  it('refuses an absent value', () => {
    expect(submittedFromView(null)).toBeNull();
    expect(submittedFromView(undefined)).toBeNull();
  });
});
