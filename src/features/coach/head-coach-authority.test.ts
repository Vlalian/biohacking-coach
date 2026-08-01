import { describe, it, expect } from 'vitest';
import {
  HEAD_COACH_ORIGIN,
  canHeadCoachEditContent,
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
