import { describe, it, expect } from 'vitest';
import { isAthleteFault, normaliseNotableSignal, NOTABLE_SIGNAL_MAX } from './check-in-input';

describe('normaliseNotableSignal', () => {
  it('trims what the athlete wrote', () => {
    expect(normaliseNotableSignal('  legs heavy after Tuesday  ')).toBe('legs heavy after Tuesday');
  });

  it('turns whitespace-only into "wrote nothing"', () => {
    // Null, not an empty string: the prompt renders ATHLETE SAID only for a
    // real sentence, and a blank quoted as their words would be a fabrication.
    expect(normaliseNotableSignal('   ')).toBeNull();
    expect(normaliseNotableSignal('')).toBeNull();
  });

  it('keeps null as null', () => {
    expect(normaliseNotableSignal(null)).toBeNull();
  });

  it('caps it, because it reaches the model verbatim', () => {
    expect(normaliseNotableSignal('x'.repeat(900))).toHaveLength(NOTABLE_SIGNAL_MAX);
    expect(normaliseNotableSignal('x'.repeat(NOTABLE_SIGNAL_MAX))).toHaveLength(NOTABLE_SIGNAL_MAX);
  });

  it('refuses anything that is not text, as undefined rather than by throwing', () => {
    expect(normaliseNotableSignal(42)).toBeUndefined();
    expect(normaliseNotableSignal(undefined)).toBeUndefined();
    expect(normaliseNotableSignal({ text: 'x' })).toBeUndefined();
    expect(normaliseNotableSignal(['x'])).toBeUndefined();
  });
});

describe('isAthleteFault', () => {
  it('recognises the repository refusing an incomplete Check-in', () => {
    expect(isAthleteFault(new Error('Check-in is not complete: energy missing'))).toBe(true);
    expect(isAthleteFault(new Error('NOT COMPLETE'))).toBe(true);
  });

  it('does not blame the athlete for anything else', () => {
    expect(isAthleteFault(new Error('connection refused'))).toBe(false);
    expect(isAthleteFault('not complete')).toBe(false);
    expect(isAthleteFault(null)).toBe(false);
  });
});
