import { describe, it, expect } from 'vitest';
import { IDLE_DECISION, cancelled, committed, received, restoredDecision } from './plan-decision';

/**
 * The athlete's decision on a proposed week, as both hosts apply it
 * (`training-architecture/20`). What the card shows after each outcome is a
 * behaviour the athlete sees, so every branch is pinned here rather than in
 * either host.
 */
const PLAN = { sessions: [{ date: '2026-09-18', type: 'Endurance', durationMinutes: 40, zone: 'Z2', note: null }] };
const OTHER = { sessions: [{ date: '2026-09-19', type: 'Intensity', durationMinutes: 30, zone: 'Z4', note: null }] };
const PENDING = { proposal: PLAN, popupOpen: true, notice: { kind: 'none' as const } };

describe('restoredDecision — what a conversation restores into', () => {
  it('a pending proposal comes back with the popup up, and no notice', () => {
    expect(restoredDecision(PLAN)).toEqual(PENDING);
  });

  it('nothing pending is idle, whether null or undefined', () => {
    expect(restoredDecision(null)).toBe(IDLE_DECISION);
    expect(restoredDecision(undefined)).toBe(IDLE_DECISION);
  });
});

describe('received — a turn came back', () => {
  it('a fresh proposal supersedes the earlier one and reopens the popup', () => {
    const dismissed = { ...PENDING, popupOpen: false, notice: { kind: 'stale' as const } };
    expect(received(dismissed, OTHER)).toEqual({ proposal: OTHER, popupOpen: true, notice: { kind: 'none' } });
  });

  it('a turn with no proposal leaves a pending one exactly as it was', () => {
    const dismissed = { ...PENDING, popupOpen: false };
    expect(received(dismissed, null)).toBe(dismissed);
    expect(received(dismissed, undefined)).toBe(dismissed);
  });
});

describe('committed — the athlete confirmed', () => {
  it('written: the card goes and the athlete is told how much landed', () => {
    expect(committed(PENDING, { ok: true, sessionCount: 3 })).toEqual({
      proposal: null,
      popupOpen: false,
      notice: { kind: 'planned', count: 3 },
    });
  });

  it('stale: the proposal stays, the popup drops to the bar, and the notice says so', () => {
    expect(committed(PENDING, { ok: false, reason: 'stale' })).toEqual({
      proposal: PLAN,
      popupOpen: false,
      notice: { kind: 'stale' },
    });
  });

  it('any other refusal keeps the card exactly where it was and reports an error', () => {
    expect(committed(PENDING, { ok: false, reason: 'not-owner' })).toEqual({ ...PENDING, notice: { kind: 'error' } });
  });
});

describe('cancelled — the athlete declined', () => {
  it('cleared on success, nothing written', () => {
    expect(cancelled(PENDING, { ok: true })).toBe(IDLE_DECISION);
  });

  it('kept, with an error, when the decline was refused', () => {
    expect(cancelled(PENDING, { ok: false })).toEqual({ ...PENDING, notice: { kind: 'error' } });
  });
});
