import { describe, it, expect } from 'vitest';
import {
  NOTE_MAX,
  createdStatusFor,
  isValidAthleteSessionType,
  isValidDuration,
  normalizeNote,
  validateAthleteSessionDraft,
} from './athlete-session-rules';

const TODAY = '2026-07-15';

describe('isValidAthleteSessionType', () => {
  it('accepts the three Athlete Session types', () => {
    for (const type of ['Mobility', 'Strength', 'Other']) {
      expect(isValidAthleteSessionType(type)).toBe(true);
    }
  });

  it('rejects a Coach-owned Session Type — the athlete does not author those', () => {
    // The Coach owns training load; Athlete Sessions are extras on top
    // (CONTEXT.md), so Endurance/Intensity/Rest are not the athlete's to create.
    for (const type of ['Endurance', 'Intensity', 'Rest', '', null, 42]) {
      expect(isValidAthleteSessionType(type)).toBe(false);
    }
  });
});

describe('isValidDuration', () => {
  it('accepts a positive whole number of minutes, or none at all', () => {
    expect(isValidDuration(45)).toBe(true);
    expect(isValidDuration(null)).toBe(true);
  });

  it('rejects zero, negatives, fractions and non-numbers', () => {
    for (const d of [0, -30, 12.5, '45', undefined, NaN]) {
      expect(isValidDuration(d)).toBe(false);
    }
  });
});

describe('normalizeNote', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeNote('  felt strong  ')).toBe('felt strong');
  });

  it('collapses an empty or whitespace-only note to null', () => {
    // The column should hold "no note", not "".
    expect(normalizeNote('')).toBeNull();
    expect(normalizeNote('   ')).toBeNull();
    expect(normalizeNote(null)).toBeNull();
    expect(normalizeNote(undefined)).toBeNull();
  });

  it('caps a long note rather than rejecting it', () => {
    expect(normalizeNote('x'.repeat(NOTE_MAX + 200))).toHaveLength(NOTE_MAX);
  });
});

describe('createdStatusFor — retro-logging', () => {
  it('creates a past or same-day session as already completed', () => {
    // "done but forgotten" — there is no deadline on recording reality.
    expect(createdStatusFor('2026-07-14', TODAY)).toBe('completed');
    expect(createdStatusFor(TODAY, TODAY)).toBe('completed');
  });

  it('creates a future session as planned', () => {
    expect(createdStatusFor('2026-08-01', TODAY)).toBe('planned');
  });
});

describe('validateAthleteSessionDraft', () => {
  it('normalizes a valid draft', () => {
    expect(
      validateAthleteSessionDraft({
        type: 'Strength',
        durationMin: 45,
        isTraining: true,
        note: '  gym  ',
      }),
    ).toEqual({
      ok: true,
      draft: { type: 'Strength', durationMin: 45, isTraining: true, note: 'gym' },
    });
  });

  it('refuses an invalid type or duration as data, never by throwing', () => {
    expect(
      validateAthleteSessionDraft({
        type: 'Endurance',
        durationMin: 45,
        isTraining: true,
        note: null,
      }),
    ).toEqual({ ok: false, reason: 'invalid' });

    expect(
      validateAthleteSessionDraft({
        type: 'Strength',
        durationMin: -5,
        isTraining: true,
        note: null,
      }),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('is the single gate, so create and edit cannot disagree about what is legal', () => {
    const input = { type: 'Other', durationMin: null, isTraining: false, note: 'x'.repeat(600) };
    const first = validateAthleteSessionDraft(input);
    const second = validateAthleteSessionDraft(input);
    expect(first).toEqual(second);
    expect(first.ok && first.draft.note).toHaveLength(NOTE_MAX);
  });
});
