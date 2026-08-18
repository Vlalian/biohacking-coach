import type { Onboarding } from './check-in';
import { assertNoDirectIdentifier } from './check-in';
import {
  assemble,
  block,
  buildOnboardingLines,
  languageDirective,
  type PromptBlock,
} from './prompt-blocks';
import { reflectionScoreToTen } from './weekly-session';
import type { CoachMessage } from './coach-client';
import { toApiMessages, type Message } from './conversation';

/**
 * The Coach Briefing's pure orchestration and prompt rendering — the AI briefing
 * the Head Coach about ONE linked athlete (CONTEXT.md: the upward half of Hyper
 * Intelligence; V1, one athlete at a time — the roster-wide Roster Briefing is
 * V2 and out of scope, ADR 0004).
 *
 * Everything here is plain data in, prompt strings out: no DB, no HTTP, no
 * Anthropic client. The briefing service ({@link briefing-service}) does the
 * gated fetching and wires this to the repository and the adapter.
 *
 * Link Visibility is the contract, and it is honoured *upstream* of this module:
 * the service fetches the athlete's reports and transcripts only when the flags
 * permit, so `reports`/`transcripts` are already null when withheld. This module
 * never re-derives the gate — it renders exactly the material it is handed, and a
 * null section simply omits its block. "A Briefing that quietly summarises what
 * the coach is not permitted to read defeats the toggle" — so the withheld data
 * never reaches here to be summarised.
 *
 * GDPR decision 1 holds: no real identity is ever assembled into the prompt. The
 * material is keyed off the opaque athlete id and carries no name or email;
 * {@link buildBriefingContext} asserts it before it can reach a prompt.
 */

/** The coach's implicit opening turn (a prompt device, never persisted). */
export const BRIEFING_OPENER = 'Brief me on this athlete.';

/** One plan session as the briefing reports it — always visible (ADR 0003). */
export interface BriefingPlanEntry {
  date: string;
  type: string;
  status: string;
  duration: number | null;
  zone: string | null;
  note: string | null;
}

/** One Session Reflection as the briefing reads it — gated by shareAthleteReports. */
export interface BriefingReflection {
  date: string;
  type: string;
  /** Stored 1–5; carried on the 1–10 RPE axis for one consistent scale. */
  body: number;
  mind: number;
  comment: string | null;
}

/** The athlete's training-profile fields — gated by shareAthleteReports. */
export interface BriefingProfile {
  phase: string | null;
  experienceLevel: string | null;
  raceTarget: string | null;
  sessionsPerWeek: number | null;
  onboarding: Onboarding | null;
}

/** The self-reported half of the material — present only when reports are shared. */
export interface BriefingReports {
  profile: BriefingProfile;
  reflections: BriefingReflection[];
}

/** One shared conversation excerpt — present only when transcripts are shared. */
export interface BriefingTranscript {
  kind: 'coach_chat' | 'weekly_session';
  lines: string[];
}

export interface BriefingContext {
  today: string;
  language?: string;
  /** The plan — always visible, no flag (ADR 0003). */
  plan: BriefingPlanEntry[];
  /** Self-reported data, or null when `shareAthleteReports` is off. */
  reports: BriefingReports | null;
  /** Athlete conversations, or null when `shareAiTranscripts` is off. */
  transcripts: BriefingTranscript[] | null;
}

/**
 * Assembles the briefing context from already-gated material and asserts no
 * direct identifier is present before it can reach a prompt (GDPR decision 1).
 *
 * The gate that decides *whether* reports/transcripts are fetched lives in the
 * service; here they arrive already null when withheld. The identity assertion
 * walks only the app-assembled structured material (plan + profile + reflection
 * scores) — not the transcript free-text, which is the athlete's own words
 * reaching the model exactly as it already does in Coach Chat, not an identifier
 * the app injected.
 */
export function buildBriefingContext(input: {
  today: string;
  plan: BriefingPlanEntry[];
  reports: BriefingReports | null;
  transcripts: BriefingTranscript[] | null;
  language?: string;
}): BriefingContext {
  const ctx: BriefingContext = {
    today: input.today,
    language: input.language,
    plan: input.plan,
    reports: input.reports,
    transcripts: input.transcripts,
  };
  // Guard the material the app assembled from the athlete's opaque record. The
  // transcripts are deliberately excluded — see the doc comment.
  assertNoDirectIdentifier({ plan: ctx.plan, reports: ctx.reports });
  return ctx;
}

/** Maps a stored 1–5 reflection to the /10 axis the briefing speaks in. */
export function toBriefingReflection(r: {
  date: string;
  type: string;
  feedbackBody: number;
  feedbackMind: number;
  feedbackComment: string | null;
}): BriefingReflection {
  return {
    date: r.date,
    type: r.type,
    body: reflectionScoreToTen(r.feedbackBody),
    mind: reflectionScoreToTen(r.feedbackMind),
    comment: r.feedbackComment,
  };
}

const weekdayShort = (dateKey: string): string =>
  new Date(dateKey + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

function planLine(s: BriefingPlanEntry): string {
  const bits = [
    `${weekdayShort(s.date)} ${s.date}`,
    s.type,
    s.duration != null ? `${s.duration}min` : null,
    s.zone,
    s.status !== 'planned' ? s.status : null,
  ].filter(Boolean);
  const note = s.note ? ` — "${s.note}"` : '';
  return `- ${bits.join(' · ')}${note}`;
}

function reflectionLine(r: BriefingReflection): string {
  const comment = r.comment ? ` · "${r.comment}"` : '';
  return `- ${weekdayShort(r.date)} ${r.date} · ${r.type} · Body ${r.body}/10 · Mind ${r.mind}/10${comment}`;
}

function profileLines(p: BriefingProfile): string[] {
  const lines: string[] = [];
  if (p.phase) lines.push(`Training phase: ${p.phase}`);
  if (p.experienceLevel) lines.push(`Experience: ${p.experienceLevel}`);
  if (p.raceTarget) lines.push(`Race target: ${p.raceTarget}`);
  if (p.sessionsPerWeek != null)
    lines.push(`Training sessions per week: ${p.sessionsPerWeek}`);
  lines.push(...buildOnboardingLines(p.onboarding));
  return lines;
}

/**
 * The plan is always visible: the calendar carries no Link Visibility flag, so a
 * Head Coach can always see it (ADR 0003).
 */
function planBlock(plan: BriefingPlanEntry[]): string {
  if (plan.length === 0) return "PLAN: No sessions on this athlete's calendar yet.";
  return `PLAN (always visible — the calendar and its sessions):\n${plan.map(planLine).join('\n')}`;
}

/**
 * The athlete's self-reported material, or the sentence that says it is withheld.
 *
 * `reports` is null when `shareAthleteReports` is off — and the service never
 * fetched it, so this is not "fetched then hidden". The withheld branch tells the
 * Coach plainly what it does not have, which is what stops it speculating.
 */
function reportsBlocks(reports: BriefingReports | null): PromptBlock[] {
  if (!reports) {
    return [
      "SELF-REPORTED DATA: withheld. This athlete has not shared their reflections, check-ins, or profile stats with the coach. You have the plan only. Do not speculate about how they felt or their private stats — say plainly you don't have it if asked.",
    ];
  }
  const profile = profileLines(reports.profile);
  return [
    block(
      'PROFILE (self-reported):',
      profile.map((l) => `- ${l}`),
    ),
    reports.reflections.length > 0
      ? `SESSION REFLECTIONS (Body/Mind the athlete reported):\n${reports.reflections
          .map(reflectionLine)
          .join('\n')}`
      : 'SESSION REFLECTIONS: none rated yet.',
  ];
}

/** The shared transcripts, or the sentence that says they are not shared. */
function transcriptsBlock(transcripts: BriefingTranscript[] | null): string {
  if (!transcripts) {
    return 'ATHLETE CONVERSATIONS: withheld. The athlete has not shared their private Coach Chat and Weekly Session transcripts. Do not quote or paraphrase them.';
  }
  if (transcripts.length === 0) return 'ATHLETE CONVERSATIONS: shared, but none yet.';
  return `ATHLETE CONVERSATIONS (shared by the athlete):\n${transcripts
    .map(
      (t) =>
        `[${t.kind === 'coach_chat' ? 'Coach Chat' : 'Weekly Session'}]\n${t.lines.join('\n')}`,
    )
    .join('\n\n')}`;
}

const BRIEFING_POSTURE = `You are talking TO the human coach, ABOUT their athlete. Report and analyse; never coach the athlete here and never address the athlete directly. Refer to the athlete in the third person; never use a real name.

POSTURE: Confident, evidence-led, direct — a peer to the coach. State your read, back it with the material below, and invite the coach to interrogate it (patterns, a week summary, "how has their sleep trended?"). No markdown, no lists unless the coach asks for a breakdown. Concise.

BOUNDARIES:
- Draw ONLY on the material below. If the coach asks about something not here, say plainly you don't have it — never invent sessions, feelings, or numbers.
- This is one athlete. You do not analyse the coach's other athletes or compare across a roster.`;

/**
 * Serialises a BriefingContext into the coach-facing system prompt. Pure.
 *
 * Assembled from blocks, like the athlete-facing prompts — same helper, so the
 * upward and downward halves of Hyper Intelligence cannot drift in how they are
 * built even though what they say is deliberately different.
 */
export function renderBriefingPrompt(ctx: BriefingContext): string {
  const { today, language, plan, reports, transcripts } = ctx;

  return assemble([
    `You are Coach, the AI coach for one athlete in a luxury Ironman training app.${languageDirective(language)} You are briefing their Head Coach — a human coach — about this athlete: the analyst who has read every data point, reporting upward (Hyper Intelligence).`,
    BRIEFING_POSTURE,
    `TODAY: ${today}`,
    planBlock(plan),
    ...reportsBlocks(reports),
    transcriptsBlock(transcripts),
  ]);
}

/**
 * Renders a stored briefing transcript into the alternating user/assistant
 * history the Anthropic API expects. The Coach speaks first (it opens the
 * briefing), so a fixed user-turn primer opens the history; it is a prompt
 * device, never persisted. The Head Coach's turns are the user turns.
 */
export function toBriefingApiMessages(transcript: Message[]): CoachMessage[] {
  return toApiMessages(transcript, BRIEFING_OPENER);
}
