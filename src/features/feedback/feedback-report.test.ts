import { describe, it, expect } from 'vitest';
import { renderFeedbackReport, type FeedbackReportInput, type ReportFeedbackRow } from './feedback-report';

const at = (iso: string) => new Date(iso);

function row(overrides: Partial<ReportFeedbackRow> & Pick<ReportFeedbackRow, 'kind' | 'body'>): ReportFeedbackRow {
  return {
    athleteId: 'athlete_1',
    view: null,
    conversationId: null,
    coachFailureReason: null,
    createdAt: at('2026-09-20T10:00:00Z'),
    ...overrides,
  };
}

const interview: FeedbackReportInput['interviews'][number] = {
  athleteId: 'athlete_1',
  conversationId: 'conv_1',
  startedAt: at('2026-09-20T09:00:00Z'),
  turns: [
    { role: 'athlete', content: 'The long run on Tuesday made no sense.', createdAt: at('2026-09-20T09:00:00Z') },
    { role: 'coach_ai', content: 'Which session, and what did you do instead?', createdAt: at('2026-09-20T09:00:30Z') },
    { role: 'athlete', content: 'I skipped it.\nRode easy instead.', createdAt: at('2026-09-20T09:01:00Z') },
  ],
};

describe('renderFeedbackReport', () => {
  it('says plainly when nothing has been said yet', () => {
    const out = renderFeedbackReport({ interviews: [], feedback: [] });

    expect(out).toContain('No feedback yet');
    expect(out).not.toContain('Athlete ');
  });

  it('prints an interview in order, naming the speakers by role', () => {
    const out = renderFeedbackReport({ interviews: [interview], feedback: [] });

    const tester = out.indexOf('Tester:');
    const interviewer = out.indexOf('Interviewer:');
    expect(tester).toBeGreaterThan(-1);
    expect(interviewer).toBeGreaterThan(tester);
    expect(out).toContain('The long run on Tuesday made no sense.');
    expect(out).toContain('Which session, and what did you do instead?');
    // A multi-line turn stays a multi-line turn, indented under its speaker.
    expect(out).toContain('    I skipped it.\n    Rode easy instead.');
    // The interviewer is a role, never the Coach (ADR 0009).
    expect(out).not.toMatch(/\bCoach:/);
  });

  it('shows the Trust Signal beneath the interview it was asked in', () => {
    const out = renderFeedbackReport({
      interviews: [interview],
      feedback: [
        row({
          kind: 'trust_signal',
          body: 'No — I would have skipped the long run anyway.',
          conversationId: 'conv_1',
        }),
      ],
    });

    const lastTurn = out.indexOf('Rode easy instead.');
    const signal = out.indexOf('Trust Signal');
    expect(signal).toBeGreaterThan(lastTurn);
    expect(out).toContain('No — I would have skipped the long run anyway.');
    expect(out).not.toContain('interview not found');
  });

  it('prints a fallback submission with the View it came from and why the Coach failed', () => {
    const out = renderFeedbackReport({
      interviews: [],
      feedback: [
        row({
          kind: 'fallback',
          body: 'it just spins',
          view: '/training-plan',
          coachFailureReason: 'coach-unavailable',
        }),
      ],
    });

    expect(out).toContain('Fallback');
    expect(out).toContain('from /training-plan');
    expect(out).toContain('Coach failed: coach-unavailable');
    expect(out).toContain('    it just spins');
  });

  it('marks a fallback that simply chose the box, with no failure and no View', () => {
    const out = renderFeedbackReport({
      interviews: [],
      feedback: [row({ kind: 'fallback', body: 'the plan page was blank all week' })],
    });

    expect(out).toContain('from an unknown View');
    expect(out).not.toContain('Coach failed');
  });

  it('never drops a Trust Signal whose interview is missing', () => {
    const out = renderFeedbackReport({
      interviews: [],
      feedback: [row({ kind: 'trust_signal', body: 'yes', conversationId: 'conv_gone' })],
    });

    expect(out).toContain('interview not found');
    expect(out).toContain('    yes');
  });

  it('groups by athlete, by opaque id, in a stable order', () => {
    const out = renderFeedbackReport({
      interviews: [{ ...interview, athleteId: 'athlete_b', conversationId: 'conv_b' }],
      feedback: [row({ kind: 'fallback', body: 'first', athleteId: 'athlete_a' })],
    });

    const a = out.indexOf('Athlete athlete_a');
    const b = out.indexOf('Athlete athlete_b');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    // The fallback belongs under athlete_a, the interview under athlete_b.
    expect(out.indexOf('first')).toBeLessThan(b);
    expect(out.indexOf('Tester:')).toBeGreaterThan(b);
  });

  it('closes with the counts', () => {
    const out = renderFeedbackReport({
      interviews: [interview],
      feedback: [
        row({ kind: 'trust_signal', body: 'no', conversationId: 'conv_1' }),
        row({ kind: 'fallback', body: 'x', athleteId: 'athlete_2' }),
      ],
    });

    expect(out.trimEnd().split('\n').at(-1)).toBe(
      '2 athlete(s), 1 interview(s), 1 Trust Signal answer(s), 1 fallback submission(s).',
    );
  });
});
