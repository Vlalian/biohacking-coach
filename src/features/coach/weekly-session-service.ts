import { addDays, weekStartOf } from '@/lib/date';
import type { Athlete } from '@/features/athlete/athlete';
import {
  getSessionsForWeek,
  replaceCoachPlanForWeek,
} from '@/features/session/session-repository';
import { buildWeeklyContext, renderWeeklyPrompt, buildPlanExtractionPrompt } from './prompts';
import { callCoach } from './coach-client';
import {
  appendMessages,
  countWeeklySessions,
  createConversation,
  endConversation,
  getMessages,
  getOwnedConversation,
} from './conversation-repository';
import type { Message } from './conversation';
import {
  buildWeeklyCheckIn,
  parsePlanSessions,
  planToNewSessionRows,
  skippedFrom,
  toApiMessages,
  transcriptToText,
  weekFeedbackFrom,
  WEEKLY_OPENER,
  type Readiness,
} from './weekly-session';

/**
 * The Weekly Session's server-side orchestration — the edge that wires the pure
 * flow logic ({@link weekly-session}) and prompt rendering to the conversation
 * repository and the Anthropic adapter. Importing {@link callCoach} (which is
 * `server-only`) keeps this module off the client by construction.
 *
 * Every entry point takes the athlete resolved from the authenticated session
 * upstream; a client-supplied conversation id is only ever passed to the
 * repository, which checks it against that owner and refuses another athlete's
 * (ADR 0006).
 */

// Until a daily Check-in feature exists, the numeric STATE the prompt carries is
// a neutral baseline — the conversational P1 ("where are you physically?")
// gathers the athlete's real state in words. Swapping this for real readiness is
// a one-line change once that data exists.
const BASELINE_READINESS: Readiness = {
  body: 7,
  mental: 7,
  energy: 7,
  sleep: 7.5,
  pulse: 55,
};

const EXTRACTOR_SYSTEM =
  'You are a data extractor. Return only valid JSON arrays. No preamble, no code fences.';

const WEEKLY_MAX_TOKENS = 1400;
const EXTRACT_MAX_TOKENS = 600;

/**
 * Renders the Weekly Session system prompt for this athlete, reviewing the week
 * just lived. The Coach reads that week's Session Reflections (rated sessions)
 * and skips; no name or email is ever assembled into the check-in (GDPR
 * decision 1 lives in {@link buildWeeklyCheckIn}).
 */
async function renderSystem(
  athlete: Athlete,
  weeklySessionNumber: number,
  today: string,
  language?: string,
): Promise<string> {
  const weekStart = weekStartOf(today);
  const weekSessions = await getSessionsForWeek(athlete.id, weekStart);
  const checkIn = buildWeeklyCheckIn(
    athlete,
    BASELINE_READINESS,
    weeklySessionNumber,
    language,
  );
  // This slice wires the two inputs it has a real source for: the week's Session
  // Reflections (feedback) and its skips. The remaining ported inputs stay empty
  // because their data sources are later slices, not because they are optional —
  // sessionHistory (Silent Pattern Insight) needs multi-week check-in history,
  // weekActivity needs the events log surfaced, and unavailableDates/fixed
  // constraints are the Unavailable-Dates slice (14). The prompt renders them
  // conditionally, so an empty input simply omits its block.
  const ctx = buildWeeklyContext(
    checkIn,
    weekFeedbackFrom(weekSessions),
    [],
    skippedFrom(weekSessions),
    [],
    null,
    today,
  );
  return renderWeeklyPrompt(ctx);
}

export interface WeeklySessionState {
  conversationId: string;
  weeklySessionNumber: number;
  messages: Message[];
  endedAt: Date | null;
}

/** Opens a new Weekly Session: the Coach speaks first, and it is persisted. */
export async function startWeeklySession(
  athlete: Athlete,
  today: string,
  language?: string,
): Promise<WeeklySessionState> {
  const weeklySessionNumber = (await countWeeklySessions(athlete.id)) + 1;
  const conversation = await createConversation({
    athleteId: athlete.id,
    kind: 'weekly_session',
    weeklySessionNumber,
  });

  const system = await renderSystem(athlete, weeklySessionNumber, today, language);
  const reply = await callCoach({
    system,
    messages: [{ role: 'user', content: WEEKLY_OPENER }],
    maxTokens: WEEKLY_MAX_TOKENS,
  });
  const messages =
    (await appendMessages(athlete.id, conversation.id, [
      { role: 'coach_ai', content: reply },
    ])) ?? [];

  return {
    conversationId: conversation.id,
    weeklySessionNumber,
    messages,
    endedAt: null,
  };
}

export type ContinueResult =
  | { ok: true; messages: Message[] }
  | { ok: false; reason: 'not-owner' | 'empty' };

/**
 * Adds the athlete's turn and the Coach's reply to an owned Weekly Session,
 * persisting both. Refuses a conversation that is not this athlete's, and an
 * empty message.
 */
export async function continueWeeklySession(
  athlete: Athlete,
  conversationId: string,
  content: string,
  today: string,
  language?: string,
): Promise<ContinueResult> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  const conversation = await getOwnedConversation(athlete.id, conversationId);
  if (!conversation) return { ok: false, reason: 'not-owner' };

  const afterAthlete = await appendMessages(athlete.id, conversationId, [
    { role: 'athlete', content: trimmed },
  ]);
  if (!afterAthlete) return { ok: false, reason: 'not-owner' };

  const transcript = await getMessages(conversationId);
  const system = await renderSystem(
    athlete,
    conversation.weeklySessionNumber ?? 1,
    today,
    language,
  );
  const reply = await callCoach({
    system,
    messages: toApiMessages(transcript),
    maxTokens: WEEKLY_MAX_TOKENS,
  });

  await appendMessages(athlete.id, conversationId, [
    { role: 'coach_ai', content: reply },
  ]);

  return { ok: true, messages: await getMessages(conversationId) };
}

export type FinalizeResult =
  | { ok: true; sessionCount: number; weekStart: string }
  | { ok: false; reason: 'not-owner' | 'unparseable' };

/**
 * Extracts the agreed Week Plan from the transcript and writes it as next week's
 * coach-planned sessions, then marks the conversation ended. The plan replaces
 * only that week's coach sessions — completed, Garmin, and Head Coach rows are
 * untouched (see {@link replaceCoachPlanForWeek}).
 */
export async function finalizeWeeklyPlan(
  athlete: Athlete,
  conversationId: string,
  today: string,
): Promise<FinalizeResult> {
  const conversation = await getOwnedConversation(athlete.id, conversationId);
  if (!conversation) return { ok: false, reason: 'not-owner' };

  const transcript = await getMessages(conversationId);
  const raw = await callCoach({
    system: EXTRACTOR_SYSTEM,
    messages: [{ role: 'user', content: buildPlanExtractionPrompt(transcriptToText(transcript)) }],
    maxTokens: EXTRACT_MAX_TOKENS,
  });

  const items = parsePlanSessions(raw);
  // No items means the reply was not a plan, or every row was malformed — both
  // are extraction failures. Writing through would clear the week's existing
  // coach sessions and report success with nothing planned, silently losing the
  // agreed plan. An all-Rest week is different: it yields seven Rest items and
  // zero rows, which is a legitimate empty week and does write through.
  if (!items || items.length === 0) return { ok: false, reason: 'unparseable' };

  const weekStart = weekStartOf(addDays(today, 7));
  const rows = planToNewSessionRows(items, weekStart, athlete.id);
  await replaceCoachPlanForWeek(athlete.id, weekStart, rows);
  await endConversation(athlete.id, conversationId, new Date());

  return { ok: true, sessionCount: rows.length, weekStart };
}
