import { describe, it, expect } from 'vitest';
import { feedbackReport } from './feedback-args';
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

describe('feedbackReport — npm run feedback -- --since YYYY-MM-DD (showable-version/48)', () => {
  const row = (id: string, at: string) => ({ id, athleteId: 'a', kind: 'fallback' as const, body: id, view: null, conversationId: null, coachFailureReason: null, createdAt: new Date(at) });
  const edge: FeedbackReportInput = {
    interviews: [],
    feedback: [row('lastSecondBefore', '2026-09-29T23:59:59Z'), row('firstSecond', '2026-09-30T00:00:00Z')],
    thumbs: [],
    reflections: [],
  };

  it('reads --since as the start of that day, in UTC', async () => {
    const text = await feedbackReport(['--since', '2026-09-30'], async () => edge);
    expect(text).toContain('[fallback:firstSecond]');
    expect(text).not.toContain('[fallback:lastSecondBefore]');
  });

  it('refuses a missing value, a value in another shape, a date that is not one, and an unknown option', async () => {
    const report = (argv: string[]) => feedbackReport(argv, async () => edge);
    await expect(report(['--since'])).rejects.toThrow(/--since needs a value/);
    await expect(report(['--since', '--x'])).rejects.toThrow(/--since needs a value/);
    await expect(report(['--since', '30-09-2026'])).rejects.toThrow(/YYYY-MM-DD/);
    await expect(report(['--since', '2026-02-30'])).rejects.toThrow(/YYYY-MM-DD/);
    await expect(report(['--since', '2026-13-45'])).rejects.toThrow(/YYYY-MM-DD/);
    await expect(report(['--until', 'x'])).rejects.toThrow(/unknown option: --until/);
  });
});
