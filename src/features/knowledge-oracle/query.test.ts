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
  it('renders the question, the phase and the experience level into one string', () => {
    const query = buildOracleQuery({
      question: 'How should long rides be paced?',
      phase: 'build',
      experienceLevel: 'veteran',
    });

    // Pinned exactly, not by `toContain`. What gets embedded is compared by
    // cosine distance against prose, so the spacing between the context and the
    // question is part of the string being measured — a join that lost its
    // separator would glue two sentences together and shift the vector.
    expect(query).toBe(
      'Training phase: build. Athlete experience level: veteran. ' +
        'How should long rides be paced?',
    );
  });

  it('omits absent context rather than defaulting or emitting an empty label', () => {
    const query = buildOracleQuery({ question: 'How long should a taper be?' });

    expect(query).toBe('How long should a taper be?');
    expect(query).not.toMatch(/phase/i);
    expect(query).not.toMatch(/experience/i);
    // Not `intermediate`. A prompt survives a wrong-but-plausible default; a
    // query embedded with an invented experience level is a vector aimed at the
    // wrong passages, and returns confidently wrong science.
    expect(query).not.toContain('intermediate');
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

    const keys: Array<keyof OracleQuery> = ['question', 'phase', 'experienceLevel'];
    expect(keys).toHaveLength(3);
  });
});

