import { describe, it, expect } from 'vitest';
import { DirectIdentifierError } from '@/lib/identifiers';
import { buildOracleQuery, type OracleQuery } from './query';

/**
 * The Knowledge Oracle "receives only anonymised queries" (CONTEXT.md), and this
 * is where that is made true. The guarantee is structural first: `OracleQuery`
 * has no field that could carry a name, an email, a date of birth or a location,
 * so there is nothing for the builder to interpolate. The assertion is the
 * backstop over `question`, which is athlete free text and can say anything.
 */

describe('buildOracleQuery', () => {
  it('embeds the question and nothing else — exactly, since the string is what gets measured', () => {
    // Until 2026-09-17 this prefixed "Training phase: … Athlete experience
    // level: …". The SAFE-3 runs showed the prefix makes every question look
    // like triathlon-training prose, so every outside question cleared the
    // floor (20/20 against 13/20 bare) and the floor filtered nothing. Phase
    // and experience reach the Coach through the prompt, where they belong;
    // the search matches the question. Pinned with `toBe`, not `toContain`:
    // one added word shifts the vector.
    const query = buildOracleQuery({ question: 'How should long rides be paced?' });
    expect(query).toBe('How should long rides be paced?');
  });

  it('trims and collapses whitespace so the same question embeds the same way', () => {
    expect(buildOracleQuery({ question: '  How long   should a taper be?\n' })).toBe('How long should a taper be?');
  });

  it('throws when the question carries an email shape', () => {
    expect(() =>
      buildOracleQuery({ question: 'mail the plan to jane@example.com' }),
    ).toThrow(DirectIdentifierError);
  });

  it('throws when the question carries a phone shape', () => {
    expect(() => buildOracleQuery({ question: 'call me on 004512345678' })).toThrow(
      DirectIdentifierError,
    );
  });
});

describe('the OracleQuery shape', () => {
  /**
   * The structural half of the promise, checked at compile time rather than at
   * runtime — because the point is that these fields *cannot exist*, not that
   * they happen to be empty. If someone adds `name` to OracleQuery to make a
   * prompt read nicer, `npx tsc --noEmit` fails here and names the reason.
   */
  it('has no field that could carry a direct identifier', () => {
    type Forbidden =
      | 'name'
      | 'personaName'
      | 'athleteName'
      | 'email'
      | 'dateOfBirth'
      | 'dob'
      | 'location';
    type Leaked = Extract<keyof OracleQuery, Forbidden>;

    // Compiles only while `Leaked` is `never` — i.e. while no forbidden key
    // exists on the type. This line is the assertion; the runtime check below
    // only keeps the test honest about having executed.
    const noIdentityFields: Leaked extends never ? true : never = true;
    expect(noIdentityFields).toBe(true);

    const keys: Array<keyof OracleQuery> = ['question'];
    expect(keys).toHaveLength(1);
  });
});

