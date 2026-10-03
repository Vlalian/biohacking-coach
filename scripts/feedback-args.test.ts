import { describe, it, expect } from 'vitest';
import { feedbackReport, parseFeedbackArgs } from './feedback-args';
import type { FeedbackReportInput } from '../src/features/feedback/feedback-report';

describe('feedbackReport — what npm run feedback prints', () => {
  const input: FeedbackReportInput = {
    interviews: [],
    feedback: [
      { id: 'old', athleteId: 'a', kind: 'fallback', body: 'before', view: null, conversationId: null, coachFailureReason: null, createdAt: new Date('2026-09-01T09:00:00Z') },
      { id: 'new', athleteId: 'a', kind: 'fallback', body: 'after', view: null, conversationId: null, coachFailureReason: null, createdAt: new Date('2026-09-30T09:00:00Z') },
    ],
    thumbs: [],
    reflections: [],
  };

  it('prints everything without --since, and only what came after with it', async () => {
    const all = await feedbackReport([], async () => input);
    expect(all).toContain('[fallback:old]');
    expect(all).toContain('[fallback:new]');

    const recent = await feedbackReport(['--since', '2026-09-30'], async () => input);
    expect(recent).not.toContain('[fallback:old]');
    expect(recent).toContain('[fallback:new]');
  });

  it('refuses a bad option before it reads anything', async () => {
    let read = false;
    await expect(feedbackReport(['--since', 'soon'], async () => ((read = true), input))).rejects.toThrow(/YYYY-MM-DD/);
    expect(read).toBe(false);
  });
});

describe('parseFeedbackArgs — npm run feedback -- --since YYYY-MM-DD (showable-version/48)', () => {
  it('reads nothing as everything', () => {
    expect(parseFeedbackArgs([])).toEqual({});
  });

  it('reads --since as the start of that day, in UTC', () => {
    expect(parseFeedbackArgs(['--since', '2026-09-30'])).toEqual({ since: new Date('2026-09-30T00:00:00Z') });
  });

  it('refuses a missing value, a value in another shape, a date that is not one, and an unknown option', () => {
    expect(() => parseFeedbackArgs(['--since'])).toThrow(/--since needs a value/);
    expect(() => parseFeedbackArgs(['--since', '--x'])).toThrow(/--since needs a value/);
    expect(() => parseFeedbackArgs(['--since', '30-09-2026'])).toThrow(/YYYY-MM-DD/);
    expect(() => parseFeedbackArgs(['--since', '2026-02-30'])).toThrow(/YYYY-MM-DD/);
    expect(() => parseFeedbackArgs(['--since', '2026-13-45'])).toThrow(/YYYY-MM-DD/);
    expect(() => parseFeedbackArgs(['--until', 'x'])).toThrow(/unknown option: --until/);
  });
});
