import { describe, it, expect } from 'vitest';
import { answerText } from './onboarding-transcript';
import type { StepAnswer } from './onboarding-flow';

// ── answerText — every step's transcript line (training-architecture/02) ─────

describe('answerText renders a line for every step', () => {
  it('names the language in words, not its code', () => {
    expect(answerText({ step: 'language', language: 'da' })).toBe('Dansk');
    expect(answerText({ step: 'language', language: 'en' })).toBe('English');
  });

  it('records that a Preferred Name was chosen or skipped, never the name itself', () => {
    // `messages` is a training-side table keyed by athlete id (ADR 0006): the
    // line says the question was answered, and nothing more.
    expect(answerText({ step: 'name', preferredName: 'Mads' })).toBe('Chosen');
    expect(answerText({ step: 'name', preferredName: 'Mads' })).not.toContain('Mads');
    expect(answerText({ step: 'name', preferredName: '  ' })).toBe('—');
    expect(answerText({ step: 'name' })).toBe('—');
  });

  it('names the experience level and the Race Distance as given', () => {
    expect(answerText({ step: 'experience', experienceLevel: 'veteran' })).toBe('veteran');
    expect(answerText({ step: 'distance', raceDistance: 'Full' })).toBe('Full');
  });

  it('records "no race" as something the athlete said, not as a blank', () => {
    // The Coach's log should show the question was answered. An empty line
    // would read as a question that went by.
    expect(answerText({ step: 'race', noRaceYet: true })).toBe('No race booked yet');
    expect(
      answerText({ step: 'race', raceTarget: 'Ironman Copenhagen', raceDate: '2027-08-15' }),
    ).toBe('Ironman Copenhagen');
  });

  it('joins the adaptive answers, and says so when there were none', () => {
    expect(
      answerText({ step: 'adaptive', availableHours: '6–10h', motivation: 'Performance' }),
    ).toBe('6–10h · Performance');
    expect(answerText({ step: 'adaptive' })).toBe('—');
  });

  it('pairs the blocked days with the Weekly Session Day, defaulting to Sunday', () => {
    expect(
      answerText({
        step: 'constraints',
        fixedConstraints: ['Monday', 'Sunday'],
        weeklySessionDay: 'Wednesday',
      }),
    ).toBe('Monday, Sunday · Wednesday');
    expect(answerText({ step: 'constraints' })).toBe('— · Sunday');
  });
});

// The action renders the line *before* the flow validates the payload, so what
// arrives here is whatever the client sent, typed as a StepAnswer only by
// assertion. CodeRabbit on PR #60: a string where an array should be threw
// from `.join`, and `noRaceYet: false` beside a real race printed "no race".
// Validation refuses those payloads a moment later; this must not throw first.
describe('answerText survives a payload the flow has not yet refused', () => {
  const raw = (payload: unknown) => answerText(payload as StepAnswer);

  it('does not throw on a string where an array belongs', () => {
    expect(raw({ step: 'adaptive', sportBackground: 'running' })).toBe('—');
    expect(raw({ step: 'constraints', fixedConstraints: 'Monday' })).toBe('— · Sunday');
  });

  it('treats an empty list the same as no list', () => {
    // An empty array is a legitimate answer ("no blocked days") and must
    // render as the dash, not as a blank before the separator.
    expect(answerText({ step: 'constraints', fixedConstraints: [] })).toBe('— · Sunday');
    expect(answerText({ step: 'adaptive', sportBackground: [] })).toBe('—');
  });

  it('records a race as a race when noRaceYet is present but false', () => {
    // Only a true `noRaceYet` is the "no race" answer — the flow stores this
    // payload as a named race, and the transcript must say the same thing.
    expect(
      raw({ step: 'race', noRaceYet: false, raceTarget: 'Ironman Copenhagen', raceDate: '2027-08-15' }),
    ).toBe('Ironman Copenhagen');
  });
});
