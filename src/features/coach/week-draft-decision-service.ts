import type { Athlete } from '@/features/athlete/athlete';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { replaceCoachPlanForDateRange } from '@/features/session/session-repository';
import { fixedConstraintsOf, proposedToNewSessionRows, validateProposedPlan, type ProposedSession } from './weekly-session';
import { createConversation, getLatestOpenConversation, getMessages } from './conversation-repository';
import type { Message } from './conversation';
import { wholeWeekWindow } from './week-draft';
import {
  getCalendarProposalState,
  recordWeekDraftDecision,
  recordWeekDraftDiscussed,
  type CalendarProposalState,
} from './week-draft-repository';

/**
 * The athlete decides on the week the Coach drafted (`training-architecture/18`):
 * accept it, talk it over, or leave the week as it is. This is the **only**
 * module in the draft's path that writes the calendar, and it does so on one
 * verb — accept — after re-reading the draft the athlete is looking at.
 *
 * Two rulings shape it (Mads, 2026-09-14/15):
 *
 *   - **Late acceptance writes the whole week, as drafted.** A proposal
 *     accepted after its Monday is written in full, every session `planned`,
 *     including days already gone. Those become past Planned Sessions — a state
 *     the calendar and the Coach already know — and the athlete may still mark
 *     one complete. Nothing is clipped, nothing is re-shaped without approval,
 *     and nothing is written as `skipped`: a skip is the athlete's own act.
 *   - **Discuss hands the draft to the conversation.** The athlete's Coach
 *     Chat — the one conversation (`training-architecture/20`; it used to be a
 *     fresh Weekly Session) — takes the draft as its pending proposal, and the
 *     draft is withdrawn from the calendar — one pending proposal at a time
 *     (Action Proposal), so a "yes" is never ambiguous about its target.
 *
 * Every entry point takes the athlete resolved from the authenticated session
 * upstream, never an id from the request (ADR 0006).
 */

export type AcceptResult =
  | { ok: true; written: number; pastDays: number; start: string; end: string }
  | { ok: false; reason: 'not-found' | 'invalid' };

/** The visible pending draft, if `draftId` is still it; a superseded or withdrawn one is not accepted by a stale button. */
async function visibleDraft(athlete: Athlete, draftId: string, today: string) {
  const state = await getCalendarProposalState(athlete.id, today);
  return state?.kind === 'proposal' && state.draft.id === draftId ? state.draft : null;
}

export async function acceptWeekDraft(athlete: Athlete, draftId: string, today: string): Promise<AcceptResult> {
  const draft = await visibleDraft(athlete, draftId, today);
  if (!draft) return { ok: false, reason: 'not-found' };

  // The draft's whole week, whatever today is — the ruling above. Excluded
  // days are still refused: a session on a day the athlete ruled out was never
  // valid, late or not.
  const unavailableDates = await getUnavailableDates(athlete.id);
  const window = wholeWeekWindow(draft.weekStart, fixedConstraintsOf(athlete), unavailableDates);
  const validated = validateProposedPlan({ sessions: draft.sessions }, window);
  if (!validated.ok || validated.sessions.length !== draft.sessions.length) return { ok: false, reason: 'invalid' };

  const rows = proposedToNewSessionRows(validated.sessions, athlete.id);
  await replaceCoachPlanForDateRange(athlete.id, window.start, window.end, rows);
  await recordWeekDraftDecision({
    athleteId: athlete.id,
    type: 'week_plan_written',
    weekStart: draft.weekStart,
    draftId,
    sessions: validated.sessions,
  });

  return {
    ok: true,
    written: rows.length,
    pastDays: pastDaysOf(validated.sessions, today),
    start: window.start,
    end: window.end,
  };
}

/** How many of the written sessions are dated before today — said, never dropped. */
export function pastDaysOf(sessions: ProposedSession[], today: string): number {
  return new Set(sessions.filter((s) => s.date < today).map((s) => s.date)).size;
}

export type DeclineResult = { ok: true } | { ok: false; reason: 'not-found' };

export async function declineWeekDraft(athlete: Athlete, draftId: string, today: string): Promise<DeclineResult> {
  const draft = await visibleDraft(athlete, draftId, today);
  if (!draft) return { ok: false, reason: 'not-found' };
  await recordWeekDraftDecision({ athleteId: athlete.id, type: 'week_plan_declined', weekStart: draft.weekStart, draftId, sessions: [] });
  return { ok: true };
}

export type DiscussResult =
  | { ok: true; conversationId: string; messages: Message[]; proposal: { sessions: ProposedSession[] } }
  | { ok: false; reason: 'not-found' };

/**
 * Hands the draft to Coach Chat as its pending proposal, and withdraws the
 * draft from the calendar. The athlete's open chat is reused; one is minted
 * when they have never spoken to the Coach. No Coach call is made: the chat is
 * athlete-led and the proposal card carries the week, so the Coach is told the
 * week is on the table (`PROPOSED WEEK`) on the athlete's next turn rather
 * than opening with a line of its own. Cancelling on the card leaves the week
 * as it was — the same outcome as declining here.
 */
export async function discussWeekDraft(
  athlete: Athlete,
  draftId: string,
  today: string,
): Promise<DiscussResult> {
  const draft = await visibleDraft(athlete, draftId, today);
  if (!draft) return { ok: false, reason: 'not-found' };

  const open = await getLatestOpenConversation(athlete.id, 'coach_chat');
  const conversationId = open?.id ?? (await createConversation({ athleteId: athlete.id, kind: 'coach_chat' })).id;

  // One write: the proposal staged on the chat and the draft withdrawn from
  // the calendar land together, or not at all.
  await recordWeekDraftDiscussed({
    athleteId: athlete.id,
    weekStart: draft.weekStart,
    draftId,
    conversationId,
    sessions: draft.sessions,
  });
  return {
    ok: true,
    conversationId,
    messages: await getMessages(conversationId),
    proposal: { sessions: draft.sessions },
  };
}

export type { CalendarProposalState };
