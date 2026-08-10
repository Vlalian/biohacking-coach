import { getAthleteById } from '@/features/athlete/athlete-repository';
import {
  getBriefingPlan,
  getBriefingReflections,
} from '@/features/session/session-repository';
import { callCoach } from './coach-client';
import { getActiveLink, getSharedTranscripts } from './coach-repository';
import type { CoachingLink } from './coach';
import { canSeeAthleteReports } from './link-visibility';
import {
  appendBriefingMessages,
  createBriefing,
  getMessages,
  getOwnedBriefing,
} from './conversation-repository';
import type { Message } from './conversation';
import {
  BRIEFING_OPENER,
  buildBriefingContext,
  renderBriefingPrompt,
  toBriefingApiMessages,
  toBriefingReflection,
  type BriefingReports,
  type BriefingTranscript,
} from './briefing';

/**
 * The Coach Briefing's server-side orchestration — the edge wiring the pure
 * briefing logic ({@link briefing}) and prompt rendering to the repositories and
 * the Anthropic adapter. Importing {@link callCoach} (which is `server-only`)
 * keeps this module off the client by construction.
 *
 * Two gates protect every briefing, and both are re-checked on every turn:
 *
 *   1. **The link gate.** The acting coach is resolved from the authenticated
 *      session upstream; {@link getActiveLink} proves an *active* Coaching Link
 *      joins them to the athlete. No link — none, or severed — refuses, so a
 *      coach cannot brief on an athlete they are not linked to, and severing
 *      revokes access even to a briefing they once opened (slice 13 AC).
 *   2. **The ownership gate.** A client-supplied conversation id is checked
 *      against the coach in {@link getOwnedBriefing}; another coach's briefing,
 *      or an athlete-owned conversation, is refused.
 *
 * Link Visibility gates the *prompt material*, server-side and before the prompt
 * is built: {@link buildBriefingSystem} fetches the athlete's reports and
 * transcripts only when the flags permit. Withheld data is never fetched into
 * prompt inputs — not fetched-then-hidden — so a briefing cannot summarise what
 * the coach may not read. GDPR decision 1 holds throughout: no real identity is
 * ever assembled into the prompt.
 */

const BRIEFING_MAX_TOKENS = 1400;

/**
 * Renders the briefing system prompt from exactly the material the link permits.
 *
 * The plan is always read (the calendar has no flag, ADR 0003). The athlete's
 * reports (profile + Session Reflections) are read ONLY when
 * `shareAthleteReports` is on; the shared transcripts ONLY when
 * `shareAiTranscripts` is on — {@link getSharedTranscripts} returns null,
 * fetching nothing, when it is off. So a false flag means the data is never
 * fetched, and the rendered prompt omits its block entirely.
 */
async function buildBriefingSystem(
  link: CoachingLink,
  today: string,
  language?: string,
): Promise<string> {
  const athleteId = link.athleteId;

  const plan = await getBriefingPlan(athleteId);

  let reports: BriefingReports | null = null;
  if (canSeeAthleteReports(link.visibility)) {
    const [athlete, reflectionRows] = await Promise.all([
      getAthleteById(athleteId),
      getBriefingReflections(athleteId),
    ]);
    reports = {
      profile: {
        phase: athlete?.trainingPhase ?? null,
        experienceLevel: athlete?.experienceLevel ?? null,
        raceTarget: athlete?.raceTarget ?? null,
        sessionsPerWeek: athlete?.trainingSessionsPerWeek ?? null,
        onboarding: athlete?.profile?.onboarding ?? null,
      },
      reflections: reflectionRows.map(toBriefingReflection),
    };
  }

  // Gated inside getSharedTranscripts: null (nothing fetched) when the flag is off.
  const shared = await getSharedTranscripts(link);
  const transcripts: BriefingTranscript[] | null = shared
    ? shared.map((c) => ({
        kind: c.kind,
        lines: c.messages.map((m) => `${roleLabel(m.role)}: ${m.content}`),
      }))
    : null;

  const ctx = buildBriefingContext({ today, plan, reports, transcripts, language });
  return renderBriefingPrompt(ctx);
}

function roleLabel(role: 'athlete' | 'coach_ai' | 'head_coach'): string {
  if (role === 'athlete') return 'Athlete';
  if (role === 'head_coach') return 'Head Coach';
  return 'Coach';
}

export interface BriefingState {
  conversationId: string;
  messages: Message[];
}

export type StartBriefingResult =
  | ({ ok: true } & BriefingState)
  | { ok: false; reason: 'not-linked' };

/**
 * Opens a briefing: verifies the active link, creates the conversation, and the
 * Coach speaks first (the analyst's opening read), persisted. Refuses when no
 * active link joins the coach to the athlete.
 */
export async function startBriefing(
  coachId: string,
  athleteId: string,
  today: string,
  language?: string,
): Promise<StartBriefingResult> {
  const link = await getActiveLink(coachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };

  const conversation = await createBriefing({ coachId, athleteId });
  const system = await buildBriefingSystem(link, today, language);
  const reply = await callCoach({
    system,
    messages: [{ role: 'user', content: BRIEFING_OPENER }],
    maxTokens: BRIEFING_MAX_TOKENS,
  });
  const messages =
    (await appendBriefingMessages(coachId, conversation.id, [
      { role: 'coach_ai', content: reply.text },
    ])) ?? [];

  return { ok: true, conversationId: conversation.id, messages };
}

export type ContinueBriefingResult =
  | { ok: true; messages: Message[] }
  | { ok: false; reason: 'not-owner' | 'not-linked' | 'empty' };

/**
 * Adds the Head Coach's turn and the Coach's reply to a briefing this coach
 * owns, persisting both. Re-checks the ownership gate and the active link on
 * every turn: a briefing that is not this coach's, or an athlete the link no
 * longer covers (severed since it opened), is refused.
 */
export async function continueBriefing(
  coachId: string,
  conversationId: string,
  content: string,
  today: string,
  language?: string,
): Promise<ContinueBriefingResult> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  const briefing = await getOwnedBriefing(coachId, conversationId);
  if (!briefing) return { ok: false, reason: 'not-owner' };

  // Severing revokes: a link that was active when the briefing opened may be
  // gone now, so the link is proven again before any further material is read.
  const link = await getActiveLink(coachId, briefing.athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };

  const afterCoach = await appendBriefingMessages(coachId, conversationId, [
    { role: 'head_coach', content: trimmed },
  ]);
  if (!afterCoach) return { ok: false, reason: 'not-owner' };

  const transcript = await getMessages(conversationId);
  const system = await buildBriefingSystem(link, today, language);
  const reply = await callCoach({
    system,
    messages: toBriefingApiMessages(transcript),
    maxTokens: BRIEFING_MAX_TOKENS,
  });
  await appendBriefingMessages(coachId, conversationId, [
    { role: 'coach_ai', content: reply.text },
  ]);

  return { ok: true, messages: await getMessages(conversationId) };
}
