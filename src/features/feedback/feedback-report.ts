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
  /** The turn's place in its conversation: the interview's ledger key ends on the last one. */
  seq: number;
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
  id: string;
  athleteId: string;
  kind: string;
  body: string;
  view: string | null;
  conversationId: string | null;
  coachFailureReason: string | null;
  createdAt: Date;
}

/** A thumbs rating on one of Momentum's messages, with the message it pins. */
export interface ReportThumb {
  athleteId: string;
  messageId: string;
  rating: 'up' | 'down';
  comment: string | null;
  messageText: string;
  /** A rating can be changed; its ledger key carries this so a change is read again. */
  updatedAt: Date;
}

/** A Session Reflection that carries a comment. */
export interface ReportReflection {
  athleteId: string;
  sessionId: string;
  date: string;
  type: string;
  body: number | null;
  mind: number | null;
  comment: string;
  ratedAt: Date;
}

export interface FeedbackReportInput {
  interviews: ReportInterview[];
  feedback: ReportFeedbackRow[];
  thumbs: ReportThumb[];
  reflections: ReportReflection[];
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

/**
 * What a tester typed, made safe to print. The report is read in a terminal,
 * and an escape sequence in a body would be obeyed there — clearing the screen
 * or hiding the lines around it. Every control character but the line break
 * and the tab is shown as `\xNN` instead.
 */
function printable(text: string): string {
  return (
    text
      .replace(/\r\n/g, '\n')
      // oxlint-disable-next-line no-control-regex -- matching control characters is the point
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
  );
}

function indent(text: string): string {
  return printable(text)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

function renderTrustSignal(row: ReportFeedbackRow, note = ''): string[] {
  return [`  Trust Signal (${stamp(row.createdAt)}${note}): [trust:${row.athleteId}]`, indent(row.body)];
}

function renderInterview(interview: ReportInterview, trustSignal: ReportFeedbackRow | undefined): string[] {
  const lastSeq = interview.turns.at(-1)?.seq ?? 0;
  const lines = [
    `  Interview ${interview.conversationId} — started ${stamp(interview.startedAt)}, ${interview.turns.length} turn(s)` +
      ` [interview:${interview.conversationId}:${lastSeq}]`,
  ];
  for (const turn of interview.turns) {
    lines.push(`  [${stamp(turn.createdAt)}] ${SPEAKER[turn.role]}:`);
    lines.push(indent(turn.content));
  }
  // The Trust Signal is shown with the interview it was asked in, because the
  // reason is the valuable half and the reason is in the turns around it.
  if (trustSignal) lines.push(...renderTrustSignal(trustSignal));
  return lines;
}

function renderFallback(row: ReportFeedbackRow): string[] {
  // The tag is the point: a fallback with a reason on it is a tester the model
  // failed, which is a signal in itself and not just a degraded path (ADR 0009).
  const reason = row.coachFailureReason ? `, Coach failed: ${printable(row.coachFailureReason)}` : '';
  const from = row.view ? `from ${printable(row.view)}` : 'from an unknown View';
  return [`  Fallback (${stamp(row.createdAt)}, ${from}${reason}): [fallback:${row.id}]`, indent(row.body)];
}

function renderThumb(thumb: ReportThumb): string[] {
  const comment = thumb.comment ? `: ${printable(thumb.comment)}` : '';
  // The full ISO time, not `stamp`: the ledger compares keys exactly, and a
  // rating changed twice in one minute must still read as changed.
  return [
    `  Thumbs ${thumb.rating} (${stamp(thumb.updatedAt)})${comment} [thumb:${thumb.messageId}:${thumb.updatedAt.toISOString()}]`,
    indent(thumb.messageText),
  ];
}

function renderReflection(r: ReportReflection): string[] {
  const rating = (n: number | null) => `${n ?? '–'}/5`;
  return [
    `  Reflection on ${r.date} ${printable(r.type)} (Body ${rating(r.body)}, Mind ${rating(r.mind)}): [reflection:${r.sessionId}]`,
    indent(r.comment),
  ];
}

/** Oldest first, by whichever date a source is ordered on. */
const oldestFirst =
  <K extends string>(key: K) =>
  <T extends Record<K, Date>>(a: T, b: T): number =>
    a[key].getTime() - b[key].getTime();

const ofAthlete = <T extends { athleteId: string }>(rows: T[], athleteId: string): T[] =>
  rows.filter((row) => row.athleteId === athleteId);

/**
 * One athlete's section. Interviews come first with their Trust Signal beneath
 * them; then the fallback submissions; then a Trust Signal whose interview is
 * missing, so a row is never silently dropped (there is at most one per athlete:
 * `athlete_feedback_trust_signal_once`); then thumbs ratings and reflections.
 */
function renderAthlete(athleteId: string, input: FeedbackReportInput, trustSignals: ReportFeedbackRow[], fallbacks: ReportFeedbackRow[]): string[] {
  const interviews = ofAthlete(input.interviews, athleteId).sort(oldestFirst('startedAt'));
  const asked = new Set(interviews.map((i) => i.conversationId));
  const orphans = ofAthlete(trustSignals, athleteId).filter((t) => !(t.conversationId && asked.has(t.conversationId)));
  return [
    `Athlete ${athleteId}`,
    '-'.repeat(90),
    ...interviews.flatMap((i) => renderInterview(i, trustSignals.find((t) => t.conversationId === i.conversationId))),
    ...ofAthlete(fallbacks, athleteId).sort(oldestFirst('createdAt')).flatMap(renderFallback),
    ...orphans.flatMap((t) => renderTrustSignal(t, ', interview not found')),
    ...ofAthlete(input.thumbs, athleteId).sort(oldestFirst('updatedAt')).flatMap(renderThumb),
    ...ofAthlete(input.reflections, athleteId).sort(oldestFirst('ratedAt')).flatMap(renderReflection),
    '',
  ];
}

/**
 * Only what was written on or after `since` (`npm run feedback -- --since`),
 * each source judged by its own date: a turn by when it was said, a submission
 * by when it was sent, a thumbs rating by when it was last changed, a
 * reflection by when it was rated. An interview keeps only its new turns and
 * goes when none are left. The ledger in `/feedback-review` does the exact
 * de-duplication; this only keeps the file short.
 */
export function sinceFilter(input: FeedbackReportInput, since: Date): FeedbackReportInput {
  const after = (d: Date) => d.getTime() >= since.getTime();
  return {
    interviews: input.interviews
      .map((i) => ({ ...i, turns: i.turns.filter((t) => after(t.createdAt)) }))
      .filter((i) => i.turns.length > 0),
    feedback: input.feedback.filter((f) => after(f.createdAt)),
    thumbs: input.thumbs.filter((t) => after(t.updatedAt)),
    reflections: input.reflections.filter((r) => after(r.ratedAt)),
  };
}

/**
 * Everything testers have said, grouped by athlete and in the order it
 * happened, each item carrying the key `/feedback-review`'s ledger uses. A
 * summary line closes it.
 */
export function renderFeedbackReport(input: FeedbackReportInput): string {
  const athleteIds = [
    ...new Set([...input.interviews, ...input.feedback, ...input.thumbs, ...input.reflections].map((r) => r.athleteId)),
  ].sort();
  const trustSignals = input.feedback.filter((f) => f.kind === 'trust_signal');
  const fallbacks = input.feedback.filter((f) => f.kind === 'fallback');
  const lines = ['Feedback Interview readout — grouped by athlete, opaque ids only.', ''];

  if (athleteIds.length === 0) {
    lines.push('No feedback yet: no interview has been started and nothing has been submitted.');
    return lines.join('\n');
  }

  lines.push(...athleteIds.flatMap((id) => renderAthlete(id, input, trustSignals, fallbacks)));
  lines.push(
    `${athleteIds.length} athlete(s), ${input.interviews.length} interview(s), ` +
      `${trustSignals.length} Trust Signal answer(s), ${fallbacks.length} fallback submission(s), ` +
      `${input.thumbs.length} thumbs rating(s), ${input.reflections.length} reflection comment(s).`,
  );
  return lines.join('\n');
}
