import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { events } from '@/db/schema';
import type { Citation } from '@/lib/citation';
import {
  hasCoachPlannedSession,
  pendingWeekDraft,
  visibleTo,
  weekDraftHistory,
  WEEK_DRAFT_EVENT,
  type SkeletonDay,
  type WeekDraft,
  type WeekDraftEvent,
} from './week-draft';
import { latestPlanDecision } from './plan-proposal-repository';
import { getSessionsForWeek } from '@/features/session/session-repository';
import { PLAN_EVENT } from './plan-proposal';
import { addDays, weekStartOf } from '@/lib/date';
import type { ProposedSession } from './weekly-session';

/**
 * The staging store for silently drafted weeks (`training-architecture/16`),
 * over the append-only `events` log — the same home the Weekly Session's
 * proposals have (`plan-proposal-repository.ts`), keyed on `weekStart` instead
 * of a conversation because a silent draft has no conversation.
 *
 * Every read and write is scoped to the athlete id resolved from the
 * authenticated session upstream, in the `WHERE` itself (ADR 0006).
 */

/** The event types a week's draft history is read from. */
const WEEK_DRAFT_TYPES = [
  WEEK_DRAFT_EVENT.drafted,
  WEEK_DRAFT_EVENT.approved,
  WEEK_DRAFT_EVENT.withdrawn,
  'week_plan_written',
  'week_plan_declined',
];

/**
 * The draft a week is still waiting on, or null. Bounded in SQL to this
 * athlete and this `weekStart`; the decision itself is the pure
 * {@link pendingWeekDraft}.
 */
export async function getPendingWeekDraft(
  athleteId: string,
  weekStart: string,
  /**
   * The athlete's own reads pass today, and get nothing before the draft's
   * `visibleFrom` — a linked Head Coach's day-early preview (`/17`). The
   * coach-side reads pass nothing and see it regardless.
   */
  options: { asOf?: string } = {},
): Promise<WeekDraft | null> {
  const pending = await readPendingWeekDraft(athleteId, weekStart);
  if (!pending) return null;
  return options.asOf === undefined || visibleTo(pending, options.asOf) ? pending : null;
}

async function readPendingWeekDraft(athleteId: string, weekStart: string): Promise<WeekDraft | null> {
  return pendingWeekDraft(await readWeekDraftEvents(athleteId, weekStart), weekStart);
}

/** The week's draft events, oldest first — what both history readers walk. */
async function readWeekDraftEvents(athleteId: string, weekStart: string): Promise<WeekDraftEvent[]> {
  return getDb()
    .select({ id: events.id, type: events.type, payload: events.payload, createdAt: events.createdAt })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        inArray(events.type, WEEK_DRAFT_TYPES),
        sql`${events.payload} ->> 'weekStart' = ${weekStart}`,
      ),
    )
    .orderBy(asc(events.createdAt));
}

/**
 * What became of a week's draft, with a week that went into a conversation
 * resolved through that conversation's decisions (`training-architecture/24`).
 */
export type ResolvedWeekDraftHistory =
  | { kind: 'never' }
  | { kind: 'pending'; draft: WeekDraft }
  | { kind: 'declined' }
  | { kind: 'written' }
  | { kind: 'discussing'; conversationId: string };

/**
 * The pure {@link weekDraftHistory} over the week's rows; a `discussed` week
 * asks the conversation what the athlete decided after the handoff — the
 * chat's decisions carry a conversation, not a week, so the rows alone cannot
 * say. Nothing decided yet is `discussing`.
 */
export async function getWeekDraftHistory(athleteId: string, weekStart: string): Promise<ResolvedWeekDraftHistory> {
  const history = weekDraftHistory(await readWeekDraftEvents(athleteId, weekStart), weekStart);
  if (history.kind !== 'discussed') return history;
  const decided = await latestPlanDecision(athleteId, history.conversationId, history.handedAt);
  return decided ? { kind: decided } : { kind: 'discussing', conversationId: history.conversationId };
}

export interface NewWeekDraft {
  athleteId: string;
  weekStart: string;
  visibleFrom: string;
  sessions: ProposedSession[];
  citations: Citation[];
  skeleton: SkeletonDay[];
  /**
   * The week already held the structure's sessions, so the draft adjusted it
   * rather than filling an empty one (`training-architecture/40`). Narration
   * reads it later, when that fact can no longer be recovered.
   */
  adjusted?: boolean;
  /** The Coach's one sentence on what it changed, when it gave one. */
  whatChanged?: string | null;
}

/**
 * Stages a drafted week as the Coach — unless one is already pending for that
 * week.
 *
 * The check-and-claim: the insert is guarded by `NOT EXISTS` over the same
 * athlete's `week_drafted` rows for this `weekStart` that no later written /
 * declined / withdrawn event has resolved, so a run that arrives after another
 * has committed writes nothing and learns it from the row count. **Not
 * exclusive under true concurrency**: two runs inside the same READ COMMITTED
 * window each see a snapshot without the other's row and both insert
 * (CodeRabbit, PR #69). What that costs is a second generation and a second
 * `week_drafted` row for the week; nothing is lost, because `pendingWeekDraft`
 * keeps the newest carrier and both are the same proposal. Closing it needs a
 * partial unique index or an advisory lock, and joins the transaction work at
 * post-testing entry 8.
 *
 * `actor_id` is null: the Coach has no id to name, and the narration for this
 * event names no human by construction (`narration.ts:coachClause`).
 */
export async function recordWeekDraft(draft: NewWeekDraft): Promise<'drafted' | 'exists'> {
  const { athleteId, weekStart, visibleFrom, sessions, citations, skeleton, adjusted, whatChanged } = draft;
  // An absent field is left out of the JSON, so a draft that says nothing
  // about either writes exactly the payload it always did.
  const payload = { weekStart, visibleFrom, sessions, citations, skeleton, adjusted, whatChanged };

  const statement = sql`
    INSERT INTO ${events} (
      ${sql.identifier('athlete_id')},
      ${sql.identifier('actor_type')},
      ${sql.identifier('type')},
      ${sql.identifier('payload')}
    )
    SELECT
      ${athleteId}::uuid,
      'coach_ai',
      ${WEEK_DRAFT_EVENT.drafted},
      ${JSON.stringify(payload)}::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM ${events} AS drafted
      WHERE drafted.${sql.identifier('athlete_id')} = ${athleteId}::uuid
        AND drafted.${sql.identifier('type')} = ${WEEK_DRAFT_EVENT.drafted}
        AND drafted.${sql.identifier('payload')} ->> 'weekStart' = ${weekStart}
        AND NOT EXISTS (
          SELECT 1 FROM ${events} AS resolved
          WHERE resolved.${sql.identifier('athlete_id')} = ${athleteId}::uuid
            AND resolved.${sql.identifier('type')} IN ('week_plan_written', 'week_plan_declined', ${WEEK_DRAFT_EVENT.withdrawn})
            AND resolved.${sql.identifier('payload')} ->> 'weekStart' = ${weekStart}
            AND resolved.${sql.identifier('created_at')} > drafted.${sql.identifier('created_at')}
        )
    )
    RETURNING ${events.id}
  `;

  const result = (await getDb().execute(statement)) as { rows: unknown[] };
  return result.rows.length > 0 ? 'drafted' : 'exists';
}

/** The Head Coach's approved version of a draft (`training-architecture/17`). */
export interface WeekDraftApproval {
  athleteId: string;
  headCoachId: string;
  /** The Coach's draft this approves. */
  draftId: string;
  weekStart: string;
  visibleFrom: string;
  sessions: ProposedSession[];
  citations: Citation[];
  /** Whether the coach changed anything — decides whether the athlete is told (narration). */
  changed: boolean;
}

/**
 * Records the Head Coach's approval as their own attributed event. It carries
 * the whole draft again, so it stands in for the Coach's on the athlete's side
 * ({@link pendingWeekDraft} prefers the newest carrier). Nothing is written to
 * `sessions`: the athlete's accept (`/18`) is still the only write.
 */
export async function recordWeekDraftApproval(approval: WeekDraftApproval): Promise<void> {
  const { athleteId, headCoachId, draftId, weekStart, visibleFrom, sessions, citations, changed } = approval;
  await getDb().insert(events).values({
    athleteId,
    actorType: 'head_coach',
    actorId: headCoachId,
    type: WEEK_DRAFT_EVENT.approved,
    payload: { draftId, weekStart, visibleFrom, sessions, citations, changed },
  });
}

/**
 * Withdraws every draft still in the Head Coach's preview — visible to the
 * athlete only from a day that has not come — so the next app-open drafts
 * afresh. Mads, 2026-09-14: a link severed mid-preview discards the draft,
 * because nobody can tell what the departed coach had half-done to it. A draft
 * the athlete can already see is theirs and is left alone.
 *
 * `system`, not a person: it is a consequence of the athlete's sever, not a
 * coaching act, and it must never narrate.
 */
export async function withdrawPreviewDrafts(athleteId: string, today: string): Promise<number> {
  const thisWeek = weekStartOf(today);
  // Three weeks, not two: a cycle anchored a day early can be due the week
  // after next (a Sunday trigger for a Monday athlete anchors on the coming
  // Monday and drafts the week after it), and a preview left there would reach
  // the athlete on their day as the departed coach's half-shaped draft.
  const weeks = [thisWeek, addDays(thisWeek, 7), addDays(thisWeek, 14)];
  let withdrawn = 0;
  for (const weekStart of weeks) {
    const pending = await readPendingWeekDraft(athleteId, weekStart);
    if (!pending || visibleTo(pending, today)) continue;
    await getDb().insert(events).values({
      athleteId,
      actorType: 'system',
      actorId: null,
      type: WEEK_DRAFT_EVENT.withdrawn,
      payload: { weekStart, draftId: pending.id, reason: 'severed' },
    });
    withdrawn += 1;
  }
  return withdrawn;
}

/**
 * What the athlete's calendar shows about a drafted week (`/18`, `/24`): the
 * proposal itself, a pointer to the conversation it moved into, an offer to
 * draft a declined week once more, or nothing.
 */
export type CalendarProposalState =
  | { kind: 'proposal'; draft: WeekDraft }
  | { kind: 'discussing'; conversationId: string; weekStart: string }
  | { kind: 'redraft-offer'; weekStart: string };

/**
 * This week's visible pending draft, else next week's — the nearer week is the
 * one the athlete should decide first (Mads, 2026-09-17; it used to be next
 * week first). When neither is pending: a week handed to a conversation that
 * has decided nothing is "being discussed", so the calendar can point at where
 * it went; else the nearer declined week with no coach-planned session gets
 * the one offer to draft again (`/24`, decision 1). Two history reads, one per
 * week, and the pointer and the offer are read off the same two answers.
 */
export async function getCalendarProposalState(athleteId: string, today: string): Promise<CalendarProposalState | null> {
  const thisWeek = weekStartOf(today);
  const weeks = [thisWeek, addDays(thisWeek, 7)];
  const histories = await Promise.all(weeks.map((weekStart) => getWeekDraftHistory(athleteId, weekStart)));

  for (const history of histories) {
    if (history.kind === 'pending' && visibleTo(history.draft, today)) return { kind: 'proposal', draft: history.draft };
  }
  for (const [i, history] of histories.entries()) {
    if (history.kind === 'discussing') return { kind: 'discussing', conversationId: history.conversationId, weekStart: weeks[i] };
  }
  return redraftOffer(athleteId, weeks, histories);
}

/** The nearer declined week that holds no coach-planned session, as the offer to draft it again — or null. */
async function redraftOffer(
  athleteId: string,
  weeks: string[],
  histories: ResolvedWeekDraftHistory[],
): Promise<CalendarProposalState | null> {
  for (const [i, history] of histories.entries()) {
    if (history.kind !== 'declined') continue;
    if (!hasCoachPlannedSession(await getSessionsForWeek(athleteId, weeks[i]))) {
      return { kind: 'redraft-offer', weekStart: weeks[i] };
    }
  }
  return null;
}

/** The reason a withdrawn draft carries when the athlete took it into a conversation. */
const DISCUSSED = 'discussed';

/**
 * The week a conversation is about, or null (`training-architecture/20`): the
 * `weekStart` of the newest draft handed to *this* conversation, **while the
 * athlete has not yet decided it**. The conversation-keyed twin of
 * `getWeekDraftHistory`'s discussed branch.
 *
 * A handoff closes on the athlete's first decision after it — the week written
 * or the proposal cancelled on the card — not on the proposal's pendingness:
 * the Coach re-proposing the same week keeps the handoff open (nothing was
 * decided), and a proposal the Coach makes *after* a cancel is about this
 * week's remainder again, so the handoff must already be closed by then. The
 * review of this slice found the window outliving the draft it was chosen for.
 * Whether an open handoff's week is still current is `conversationWindow`'s
 * question, not this read's.
 */
export async function getDiscussedWeek(athleteId: string, conversationId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ payload: events.payload, createdAt: events.createdAt })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        eq(events.type, WEEK_DRAFT_EVENT.withdrawn),
        sql`${events.payload} ->> 'reason' = ${DISCUSSED}`,
        sql`${events.payload} ->> 'conversationId' = ${conversationId}`,
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(1);
  const payload = (row?.payload ?? null) as { weekStart?: unknown } | null;
  if (typeof payload?.weekStart !== 'string') return null;

  const [decided] = await getDb()
    .select({ createdAt: events.createdAt })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        inArray(events.type, [PLAN_EVENT.written, PLAN_EVENT.declined]),
        sql`${events.payload} ->> 'conversationId' = ${conversationId}`,
        gt(events.createdAt, row.createdAt),
      ),
    )
    .limit(1);
  return decided ? null : payload.weekStart;
}


/** The athlete's own decision on a draft — the event 16's pending rule resolves on. */
export async function recordWeekDraftDecision(decision: {
  athleteId: string;
  type: 'week_plan_written' | 'week_plan_declined';
  weekStart: string;
  draftId: string;
  sessions: ProposedSession[];
}): Promise<void> {
  const { athleteId, type, weekStart, draftId, sessions } = decision;
  await getDb().insert(events).values({
    athleteId,
    actorType: 'athlete',
    actorId: athleteId,
    type,
    payload: { weekStart, draftId, sessions },
  });
}

/**
 * The draft moved into a conversation (`/18`, into Coach Chat since `/20`):
 * staged as that conversation's pending proposal and withdrawn from the
 * calendar, in one batch. Two statements used to go separately, and a failure
 * between them left the proposal pending with the calendar draft still
 * actionable — two places to say yes (CodeRabbit, PR #71). `db.batch` is the
 * driver's one transactional write; both rows land or neither does.
 *
 * The proposal row is the Coach's (`coach_ai`, as `recordProposal` writes it):
 * the Coach drafted the week. The withdrawal is the athlete's act.
 */
export async function recordWeekDraftDiscussed(handoff: {
  athleteId: string;
  weekStart: string;
  draftId: string;
  conversationId: string;
  sessions: ProposedSession[];
}): Promise<void> {
  const { athleteId, weekStart, draftId, conversationId, sessions } = handoff;
  const db = getDb();
  await db.batch([
    db.insert(events).values({
      athleteId,
      actorType: 'coach_ai',
      type: PLAN_EVENT.proposed,
      payload: { conversationId, sessions },
    }),
    db.insert(events).values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: WEEK_DRAFT_EVENT.withdrawn,
      payload: { weekStart, draftId, reason: 'discussed', conversationId },
    }),
  ]);
}
