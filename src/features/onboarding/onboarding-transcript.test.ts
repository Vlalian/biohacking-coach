import { describe, it, expect } from 'vitest';
import { answerText } from './onboarding-transcript';

// ── answerText — every step's transcript line (training-architecture/02) ─────

describe('answerText renders a line for every step', () => {
  it('names the language in words, not its code', () => {
    expect(answerText({ step: 'language', language: 'da' })).toBe('Dansk');
    expect(answerText({ step: 'language', language: 'en' })).toBe('English');
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

  it('pairs the blocked days with the Weekly Session Day, defaulting to Flexible', () => {
    expect(
      answerText({
        step: 'constraints',
        fixedConstraints: ['Monday', 'Sunday'],
        weeklySessionDay: 'Wednesday',
      }),
    ).toBe('Monday, Sunday · Wednesday');
    expect(answerText({ step: 'constraints' })).toBe('— · Flexible');
  });
});
