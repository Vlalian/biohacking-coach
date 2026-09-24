import type { MessageRole } from '@/features/coach/conversation';

/**
 * The Feedback Interview readout — the pure half. Rows in, text out.
 *
 * What the interview collects is only worth anything if a builder reads it, and
 * until this existed nothing in the repository read it back: the transcript sat
 * in `conversations`/`messages` under the `feedback` kind and the Trust Signal
 * and fallback rows in `athlete_feedback`, reachable only by SQL in the Neon
 * console. This is the terminal readout, the way `metrics.ts` is for the
 * numbers — no UI, no dashboard, deliberately (`showable-version/05`).
 *
 * Keyed to the athlete's **opaque id** and nothing else (ADR 0006). The report
 * cannot name anybody; turning an id into a person means going to the database
 * yourself, and a feedback readout is not a good reason to.
 */

export interface ReportTurn {
  role: MessageRole;
  content: string;
  createdAt: Date;
}

/** One Feedback Interview, its turns in `seq` order. */
export interface ReportInterview {
  athleteId: string;
  conversationId: string;
  startedAt: Date;
  turns: ReportTurn[];
}

/** One `athlete_feedback` row: a Trust Signal answer, or a fallback submission. */
export interface ReportFeedbackRow {
  athleteId: string;
  kind: string;
  body: string;
  view: string | null;
  conversationId: string | null;
  coachFailureReason: string | null;
  createdAt: Date;
}

export interface FeedbackReportInput {
  interviews: ReportInterview[];
  feedback: ReportFeedbackRow[];
}

/**
 * The speaker labels. The interviewer is deliberately not a character and not
 * the Coach (ADR 0009), so it is named by its role, the way the page does.
 */
const SPEAKER: Record<MessageRole, string> = {
  athlete: 'Tester',
  coach_ai: 'Interviewer',
  head_coach: 'Head Coach',
};

function stamp(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

function renderInterview(interview: ReportInterview, trustSignal: ReportFeedbackRow | undefined): string[] {
  const lines = [
    `  Interview ${interview.conversationId} — started ${stamp(interview.startedAt)}, ${interview.turns.length} turn(s)`,
  ];
  for (const turn of interview.turns) {
    lines.push(`  [${stamp(turn.createdAt)}] ${SPEAKER[turn.role]}:`);
    lines.push(indent(turn.content));
  }
  // The Trust Signal is shown with the interview it was asked in, because the
  // reason is the valuable half and the reason is in the turns around it.
  if (trustSignal) {
    lines.push(`  Trust Signal (${stamp(trustSignal.createdAt)}):`);
    lines.push(indent(trustSignal.body));
  }
  return lines;
}

function renderFallback(row: ReportFeedbackRow): string[] {
  // The tag is the point: a fallback with a reason on it is a tester the model
  // failed, which is a signal in itself and not just a degraded path (ADR 0009).
  const reason = row.coachFailureReason ? `, Coach failed: ${row.coachFailureReason}` : '';
  const from = row.view ? `from ${row.view}` : 'from an unknown View';
  return [`  Fallback (${stamp(row.createdAt)}, ${from}${reason}):`, indent(row.body)];
}

/**
 * Everything testers have said through the escape hatch, grouped by athlete
 * and in the order it happened.
 *
 * Interviews come first with their Trust Signal beneath them; then the fallback
 * submissions; then any Trust Signal whose interview is missing, so a row is
 * never silently dropped. A summary line closes it.
 */
export function renderFeedbackReport(input: FeedbackReportInput): string {
  const athleteIds = [
    ...new Set([
      ...input.interviews.map((i) => i.athleteId),
      ...input.feedback.map((f) => f.athleteId),
    ]),
  ].sort();

  const trustSignals = input.feedback.filter((f) => f.kind === 'trust_signal');
  const fallbacks = input.feedback.filter((f) => f.kind === 'fallback');
  const byTime = (a: { createdAt: Date }, b: { createdAt: Date }) =>
    a.createdAt.getTime() - b.createdAt.getTime();

  const lines: string[] = [];
  lines.push('Feedback Interview readout — grouped by athlete, opaque ids only.');
  lines.push('');

  if (athleteIds.length === 0) {
    lines.push('No feedback yet: no interview has been started and nothing has been submitted.');
    return lines.join('\n');
  }

  for (const athleteId of athleteIds) {
    lines.push(`Athlete ${athleteId}`);
    lines.push('-'.repeat(90));

    const interviews = input.interviews
      .filter((i) => i.athleteId === athleteId)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    const shown = new Set<string>();
    for (const interview of interviews) {
      const answer = trustSignals.find((t) => t.conversationId === interview.conversationId);
      if (answer) shown.add(answer.conversationId!);
      lines.push(...renderInterview(interview, answer));
    }

    for (const row of fallbacks.filter((f) => f.athleteId === athleteId).sort(byTime)) {
      lines.push(...renderFallback(row));
    }

    for (const orphan of trustSignals
      .filter((t) => t.athleteId === athleteId && !(t.conversationId && shown.has(t.conversationId)))
      .sort(byTime)) {
      lines.push(`  Trust Signal (${stamp(orphan.createdAt)}, interview not found):`);
      lines.push(indent(orphan.body));
    }

    lines.push('');
  }

  lines.push(
    `${athleteIds.length} athlete(s), ${input.interviews.length} interview(s), ` +
      `${trustSignals.length} Trust Signal answer(s), ${fallbacks.length} fallback submission(s).`,
  );
  return lines.join('\n');
}
