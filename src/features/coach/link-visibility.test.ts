import { describe, it, expect } from 'vitest';
import {
  applyVisibilityToInputs,
  applyVisibilityToSessions,
  canSeeAthleteReports,
  canSeeTranscripts,
  type LinkVisibility,
} from './link-visibility';
import type { Session } from '@/features/session/session';
import type { SessionInput } from '@/features/information-view/build-dataset';

const both = (
  over: Partial<LinkVisibility> = {},
): LinkVisibility => ({
  shareAthleteReports: true,
  shareAiTranscripts: false,
  ...over,
});

const session = (over: Partial<Session> = {}): Session => ({
  id: 's1',
  date: '2026-07-13',
  type: 'Endurance',
  status: 'completed',
  dayOrder: 0,
  title: 'Ride',
  duration: 60,
  zone: 'Zone 2',
  note: 'steady',
  feedbackBody: 4,
  feedbackMind: 5,
  feedbackComment: 'felt strong',
  ...over,
});

const input = (over: Partial<SessionInput> = {}): SessionInput => ({
  id: 's1',
  date: '2026-07-13',
  status: 'completed',
  isTraining: true,
  type: 'Endurance',
  title: 'Ride',
  duration: 60,
  sport: 'cycling',
  summary: null,
  feedbackBody: 4,
  feedbackMind: 5,
  feedbackComment: 'felt strong',
  ...over,
});

describe('the flag predicates name the mapping', () => {
  it('canSeeAthleteReports follows shareAthleteReports', () => {
    expect(canSeeAthleteReports(both({ shareAthleteReports: true }))).toBe(true);
    expect(canSeeAthleteReports(both({ shareAthleteReports: false }))).toBe(false);
  });
  it('canSeeTranscripts follows shareAiTranscripts', () => {
    expect(canSeeTranscripts(both({ shareAiTranscripts: true }))).toBe(true);
    expect(canSeeTranscripts(both({ shareAiTranscripts: false }))).toBe(false);
  });
});

describe('applyVisibilityToSessions — the calendar is always visible', () => {
  it('shares reflections when reports are on, untouched', () => {
    const sessions = [session()];
    expect(applyVisibilityToSessions(sessions, both())).toBe(sessions);
  });

  it('strips only the Session Reflection when reports are off — plan survives', () => {
    const [out] = applyVisibilityToSessions(
      [session()],
      both({ shareAthleteReports: false }),
    );
    // The reflection is gone...
    expect(out.feedbackBody).toBeNull();
    expect(out.feedbackMind).toBeNull();
    expect(out.feedbackComment).toBeNull();
    // ...but the plan — date, type, duration, zone, title, note, status — stays.
    expect(out).toMatchObject({
      date: '2026-07-13',
      type: 'Endurance',
      duration: 60,
      zone: 'Zone 2',
      title: 'Ride',
      note: 'steady',
      status: 'completed',
    });
  });
});

describe('applyVisibilityToInputs — Body & Mind panel gone, not empty', () => {
  it('passes inputs through untouched when reports are shared', () => {
    const rows = [input()];
    expect(applyVisibilityToInputs(rows, both())).toBe(rows);
  });

  it('nulls the reflection fields when reports are off, leaving the plan-derived data', () => {
    const [out] = applyVisibilityToInputs(
      [input()],
      both({ shareAthleteReports: false }),
    );
    expect(out.feedbackBody).toBeNull();
    expect(out.feedbackMind).toBeNull();
    expect(out.feedbackComment).toBeNull();
    // Garmin-derived fields (the plan and its execution) are untouched.
    expect(out.sport).toBe('cycling');
    expect(out.duration).toBe(60);
  });
});
