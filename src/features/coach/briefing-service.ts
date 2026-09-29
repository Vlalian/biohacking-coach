import { refusalReason, type RefusalReason } from '@/lib/identifiers';
import { logCoachFailure } from '@/lib/coach-log';
import { getBriefingPlan } from '@/features/session/session-repository';
import { callCoach, type CoachReply } from './coach-client';
import { getActiveLink } from './coach-repository';
import type { CoachingLink } from './coach';
import { canSeeAthleteReports } from './link-visibility';
import { currentPhase, staleLastBlockOf } from './training-blocks';
import { getLatestUnrealisticFlag } from './training-block-repository';
import { briefingContextOf, briefingInclude, readAthleteContext } from './athlete-context';
import {
  appendBriefingMessages,
  createBriefing,
  getLatestBriefingWithMessages,
  getMessages,
  getOwnedBriefing,
} from './conversation-repository';
import type { Message } from './conversation';
import { getPreferredNameForAthlete } from '@/features/user-prefs/user-prefs-repository';
import {
  BRIEFING_OPENER,
  buildBriefingContext,
  renderBriefingPrompt,
  toBriefingApiMessages,
  type BriefingContext,
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

/**
 * The output cap. Raised from 1400 on 2026-09-24 (Mads, showable-version/19):
 * the API counted 1318 output tokens for a 335-word briefing, 82 under the old
 * cap, and `callCoach` does not surface `stop_reason`, so a cut would show
 * only as a briefing ending mid-sentence.
 */
export const BRIEFING_MAX_TOKENS = 2000;

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
  return renderBriefingPrompt(await buildBriefingContextFor(link, today, language));
}

/**
 * The gated, assembled context behind {@link buildBriefingSystem} — exported
 * for `scripts/briefing-length.ts` (showable-version/19), which counts what
 * reaches the prompt for the personas. Reads only; nothing here writes.
 */
export async function buildBriefingContextFor(
  link: CoachingLink,
  today: string,
  language?: string,
): Promise<BriefingContext> {
  const athleteId = link.athleteId;

  // The plan and its structure are always read (the calendar has no flag, ADR
  // 0003; the Training Blocks are the horizon that calendar is built toward).
  // The Coach's own "unrealistic" verdict travels with the blocks for the same
  // reason: it is the Coach's judgement, not the athlete's report.
  //
  // Link Visibility gates the rest, in the one athlete read shared with the
  // draft and Coach Chat (`training-architecture/52`): with a flag off the
  // signal is not in the include, so it is never fetched — not
  // fetched-then-hidden. `getSharedTranscripts` checks its own flag.
  const [plan, context, preferredName] = await Promise.all([
    getBriefingPlan(athleteId),
    readAthleteContext(athleteId, today, briefingInclude(link, canSeeAthleteReports(link.visibility))),
    // What the athlete chose for the Coach to call them (`preferred-name/02`),
    // read through the user seam for the *linked* athlete — the action cannot
    // resolve it, since the signed-in user here is the Head Coach. Ungated by
    // Link Visibility: a pseudonym the athlete picked, for a coach who already
    // sees their real name on the Roster.
    getPreferredNameForAthlete(athleteId),
  ]);
  const resolved = context.horizon;
  // Scoped to the current Target Race: a verdict on a race the athlete has since
  // replaced is not this race's.
  const raceUnrealistic = resolved.race ? await getLatestUnrealisticFlag(athleteId, resolved.race.id) : null;
  const phase = currentPhase(today, resolved.blocks);
  // A stored set the race moved out from under is listed as the draft the
  // athlete sees, and said to be stale, until the Head Coach re-pins it (19).
  const staleSet = resolved.race ? staleLastBlockOf(resolved.set, resolved.race.date) : null;
  const blocks = {
    blocks: resolved.blocks.map(({ name, endDate, authoredBy }) => ({ name, endDate, authoredBy })),
    phase,
    raceUnrealistic,
    staleSet,
  };

  const { reports, transcripts } = briefingContextOf(context, { today, phase });
  return buildBriefingContext({ today, plan, blocks, reports, transcripts, language, preferredName });
}

export interface BriefingState {
  conversationId: string;
  messages: Message[];
}

export type StartBriefingResult =
  | ({ ok: true } & BriefingState)
  | { ok: false; reason: 'not-linked' | 'failed' | RefusalReason };

/**
 * Opens — or resumes — a briefing about a linked athlete. Refuses when no active
 * link joins the coach to the athlete.
 *
 * A Coach Briefing is one ongoing channel per coach/athlete pair, not a fresh
 * thread each time (CONTEXT.md — an interrogable channel). If one already exists
 * it is resumed, never duplicated: the page restores the latest briefing on load
 * (so this "open" is normally reached only when none was restored), and opening a
 * second would orphan the first's transcript under the latest-only restore.
 *
 * When there is none, the Coach speaks first (the analyst's opening read). The
 * model is called *before* the conversation is created, so a failed call leaves
 * no empty briefing row for the page to restore into a dead end (a form with no
 * opening read and no retry). The row is born only once there is a turn to store.
 */
export async function startBriefing(
  coachId: string,
  athleteId: string,
  today: string,
  language?: string,
): Promise<StartBriefingResult> {
  const link = await getActiveLink(coachId, athleteId);
  if (!link) return { ok: false, reason: 'not-linked' };

  const existing = await getLatestBriefingWithMessages(coachId, athleteId);
  if (existing) {
    return {
      ok: true,
      conversationId: existing.conversation.id,
      messages: existing.messages,
    };
  }

  let reply: CoachReply;
  try {
    // Prompt rendering is inside the boundary with the call: it asserts on free
    // text and throws, and `callCoach` now throws on a turn with nothing in it.
    const system = await buildBriefingSystem(link, today, language);
    reply = await callCoach({
      system,
      messages: [{ role: 'user', content: BRIEFING_OPENER }],
      maxTokens: BRIEFING_MAX_TOKENS,
    });
  } catch (error) {
    // Briefing material carries athlete free text too — Session Reflection
    // comments and onboarding answers reach `buildBriefingContext` — so a
    // refused identifier is as reachable here as on the athlete side, and gets
    // the same distinct answer rather than "the Coach is unavailable".
    const reason = refusalReason(error);
    logCoachFailure({
      surface: 'coach_briefing',
      athleteId,
      conversationId: null,
      error,
      reason,
    });
    return { ok: false, reason };
  }

  const conversation = await createBriefing({ coachId, athleteId });
  // appendBriefingMessages returns null only when coach ownership fails — which
  // it cannot on a row this coach just created — but a null must never be
  // laundered into an empty-but-ok success (`?? []` did exactly that): it
  // surfaces as a persistence failure the UI can show, not a blank briefing.
  const messages = await appendBriefingMessages(coachId, conversation.id, [
    { role: 'coach_ai', content: reply.text },
  ]);
  if (!messages) return { ok: false, reason: 'failed' };

  return { ok: true, conversationId: conversation.id, messages };
}

export type ContinueBriefingResult =
  | { ok: true; messages: Message[] }
  | { ok: false; reason: 'not-owner' | 'not-linked' | 'empty' | RefusalReason };

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

  // Nothing is written until the Coach has answered — the same ordering the
  // athlete-facing services use. Persisting the Head Coach's turn first left it
  // stranded with no answer whenever the call failed, and a retry would post it
  // twice.
  const transcript = await getMessages(conversationId);

  let reply: CoachReply;
  try {
    const system = await buildBriefingSystem(link, today, language);
    reply = await callCoach({
      system,
      messages: [...toBriefingApiMessages(transcript), { role: 'user', content: trimmed }],
      maxTokens: BRIEFING_MAX_TOKENS,
    });
  } catch (error) {
    const reason = refusalReason(error);
    logCoachFailure({
      surface: 'coach_briefing',
      athleteId: briefing.athleteId,
      conversationId: briefing.id,
      error,
      reason,
    });
    return { ok: false, reason };
  }

  const afterBoth = await appendBriefingMessages(coachId, conversationId, [
    { role: 'head_coach', content: trimmed },
    { role: 'coach_ai', content: reply.text },
  ]);
  if (!afterBoth) return { ok: false, reason: 'not-owner' };

  return { ok: true, messages: await getMessages(conversationId) };
}
