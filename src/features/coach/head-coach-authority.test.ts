import { describe, it, expect } from 'vitest';
import {
  HEAD_COACH_ORIGIN,
  canHeadCoachEditContent,
  canHeadCoachMove,
} from './head-coach-authority';

describe('canHeadCoachEditContent — the content tier as a guard on origin', () => {
  it('the Head Coach may edit the Coach drafts and their own prescriptions', () => {
    expect(canHeadCoachEditContent('coach')).toBe(true);
    expect(canHeadCoachEditContent(HEAD_COACH_ORIGIN)).toBe(true);
  });

  it('an Athlete Session is view-only even to the Head Coach', () => {
    // ADR 0003: "may only view Athlete Sessions: the athlete's own entries are
    // their territory."
    expect(canHeadCoachEditContent('athlete')).toBe(false);
  });

  it('a Garmin import is the immutable record — no one edits reality', () => {
    expect(canHeadCoachEditContent('garmin')).toBe(false);
  });

  it('an unknown origin is refused rather than assumed editable', () => {
    expect(canHeadCoachEditContent('')).toBe(false);
    expect(canHeadCoachEditContent('something_new')).toBe(false);
  });
});

describe('canHeadCoachMove — the placement tier', () => {
  // Added 2026-08-21 with the ADR 0003 amendment that made placement shared
  // rather than the athlete's alone.
  it('permits the plan the Head Coach is editor-in-chief of', () => {
    expect(canHeadCoachMove('coach')).toBe(true);
    expect(canHeadCoachMove(HEAD_COACH_ORIGIN)).toBe(true);
  });

  it('refuses an Athlete Session', () => {
    // The placement rule was reversed; "may only view Athlete Sessions" was
    // not. A coach sees the athlete's own entries and leaves them alone.
    expect(canHeadCoachMove('athlete')).toBe(false);
  });

  it('refuses a Garmin import', () => {
    // The Move rules would refuse it anyway as a completed session. Asserted
    // here so the answer does not depend on that coincidence.
    expect(canHeadCoachMove('garmin')).toBe(false);
  });
});
