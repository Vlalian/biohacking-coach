import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// The mocked-chain shape of `training-block-repository.test.ts`: builder
// methods return the chain, awaiting it resolves the queued rows, `.where()`
// arguments are captured so the athlete scoping (ADR 0006) can be asserted,
// and raw statements handed to `.execute()` are rendered to real SQL.
let nextRows: unknown[] = [];
let whereArgs: unknown[] = [];
let executed: { sql: string; params: unknown[] }[] = [];
let executeRows: unknown[] = [];
let selectArgs: unknown[] = [];
let insertValues: unknown[] = [];
let rowsQueue: unknown[][] = [];
/** Each `db.batch` call, as the number of statements it carried. */
let batches: number[] = [];

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const m of ['from', 'orderBy', 'limit']) c[m] = () => c;
  c.select = (projection?: unknown) => {
    selectArgs.push(projection);
    return c;
  };
  c.where = (arg: unknown) => {
    whereArgs.push(arg);
    return c;
  };
  // `.values()` records the row whether awaited directly or handed to
  // `db.batch`; the batch records only how many statements it carried.
  c.insert = () => ({
    values: (v: unknown) => {
      insertValues.push(v);
      return { __insert: v };
    },
  });
  c.batch = async (statements: unknown[]) => {
    batches.push(statements.length);
  };
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(rowsQueue.length > 0 ? (rowsQueue.shift() as unknown[]) : nextRows).then(resolve);
  return c;
}

const execute = vi.fn(async (statement: unknown) => {
  executed.push(new PgDialect().sqlToQuery(statement as SQL));
  return { rows: executeRows };
});

vi.mock('@/db', () => ({ getDb: () => Object.assign(chain(), { execute }) }));
const getPendingProposal = vi.fn(async (): Promise<unknown> => null);
const latestPlanDecision = vi.fn(async (): Promise<'written' | 'declined' | null> => null);
vi.mock('./plan-proposal-repository', () => ({ getPendingProposal, latestPlanDecision }));
const getSessionsForWeek = vi.fn(async (): Promise<{ origin: string }[]> => []);
vi.mock('@/features/session/session-repository', () => ({ getSessionsForWeek }));

const {
  getPendingWeekDraft,
  recordWeekDraft,
  recordWeekDraftApproval,
  withdrawPreviewDrafts,
  getCalendarProposalState,
  recordWeekDraftDecision,
  recordWeekDraftDiscussed,
  getDiscussedWeek,
  getWeekDraftHistory,
} = await import('./week-draft-repository');

function boundValues(node: unknown, seen = new Set<unknown>()): unknown[] {
  if (node === null || typeof node !== 'object') return [];
  if (seen.has(node)) return [];
  seen.add(node);
  const out: unknown[] = [];
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (value === null) continue;
    if (typeof value === 'object') out.push(...boundValues(value, seen));
    else out.push(value);
  }
  return out;
}

/** Every Date bound anywhere in a drizzle condition tree. */
function datesIn(node: unknown, seen = new Set<unknown>()): Date[] {
  if (node instanceof Date) return [node];
  if (node === null || typeof node !== 'object' || seen.has(node)) return [];
  seen.add(node);
  return Object.values(node as Record<string, unknown>).flatMap((v) => datesIn(v, seen));
}

const ATHLETE = '11111111-1111-4111-8111-111111111111';
const WEEK = '2026-09-21';
const SESSION = { date: '2026-09-22', type: 'Endurance' as const, durationMinutes: 60, zone: 'Z2', note: 'easy' };

beforeEach(() => {
  nextRows = [];
  whereArgs = [];
  executed = [];
  executeRows = [];
  selectArgs = [];
  insertValues = [];
  rowsQueue = [];
  batches = [];
  execute.mockClear();
  latestPlanDecision.mockReset().mockResolvedValue(null);
  getSessionsForWeek.mockReset().mockResolvedValue([]);
});

describe('getPendingWeekDraft', () => {
  it('scopes the read to the athlete and the week in SQL, and hands the rows to the pure decision', async () => {
    nextRows = [
      {
        id: 'd1',
        type: 'week_drafted',
        payload: { weekStart: WEEK, visibleFrom: WEEK, sessions: [SESSION], citations: [] },
        createdAt: new Date('2026-09-20T08:00:00Z'),
      },
    ];

    const draft = await getPendingWeekDraft(ATHLETE, WEEK);

    expect(draft).toMatchObject({ id: 'd1', weekStart: WEEK, sessions: [SESSION] });
    const bound = boundValues(whereArgs[0]);
    expect(bound).toContain(ATHLETE);
    expect(bound).toContain(WEEK);
    // Exactly the five types a draft's history is made of — one missing and a
    // resolution is not seen, one extra and a proposal from the conversation
    // would be read as a draft.
    expect(bound.filter((v) => typeof v === 'string' && /^week_/.test(v as string))).toEqual([
      'week_drafted',
      'week_draft_approved',
      'week_draft_withdrawn',
      'week_plan_written',
      'week_plan_declined',
    ]);
    // The four columns the decision needs, nothing else — no payload-free read
    // and no accidental select-star pulling actor ids into a pure function.
    expect(Object.keys(selectArgs[0] as object).sort()).toEqual(['createdAt', 'id', 'payload', 'type']);
  });

  it('returns null for a week with nothing pending — and never another athlete’s draft, because the id is in the WHERE', async () => {
    nextRows = [];
    expect(await getPendingWeekDraft(ATHLETE, WEEK)).toBeNull();
    expect(boundValues(whereArgs[0])).toContain(ATHLETE);
  });
});

describe('recordWeekDraft', () => {
  const draft = {
    athleteId: ATHLETE,
    weekStart: WEEK,
    visibleFrom: WEEK,
    sessions: [SESSION],
    citations: [],
    skeleton: [{ date: '2026-09-22', role: 'easy' as const }],
  };

  it('inserts one coach_ai week_drafted event, guarded by NOT EXISTS over an unresolved draft for the same athlete and week', async () => {
    executeRows = [{ id: 'new' }];

    const outcome = await recordWeekDraft(draft);

    expect(outcome).toBe('drafted');
    expect(executed).toHaveLength(1);
    const { sql, params } = executed[0];
    expect(sql).toMatch(/INSERT INTO "events"/);
    expect(sql).toContain("'coach_ai'");
    expect(sql).toMatch(/WHERE NOT EXISTS/);
    expect(sql).toMatch(/->> 'weekStart'/);
    expect(sql).toMatch(/'week_plan_written', 'week_plan_declined'/);
    expect(params).toContain(ATHLETE);
    expect(params).toContain(WEEK);
    expect(params).toContain('week_drafted');
    // The statement is the guarantee, so the whole of it is pinned: every
    // identifier and the shape of the guard. A changed column name or a
    // dropped clause is a different statement, not a tidy-up.
    expect(sql.replace(/\s+/g, ' ').trim()).toMatchInlineSnapshot(`"INSERT INTO "events" ( "athlete_id", "actor_type", "type", "payload" ) SELECT $1::uuid, 'coach_ai', $2, $3::jsonb WHERE NOT EXISTS ( SELECT 1 FROM "events" AS drafted WHERE drafted."athlete_id" = $4::uuid AND drafted."type" = $5 AND drafted."payload" ->> 'weekStart' = $6 AND NOT EXISTS ( SELECT 1 FROM "events" AS resolved WHERE resolved."athlete_id" = $7::uuid AND resolved."type" IN ('week_plan_written', 'week_plan_declined', $8) AND resolved."payload" ->> 'weekStart' = $9 AND resolved."created_at" > drafted."created_at" ) ) RETURNING "events"."id""`);
    const payload = params.find((p) => typeof p === 'string' && p.startsWith('{')) as string;
    // And the parameters in the order the statement binds them: $5 and $8 are
    // the two event types the guard compares against, never the same string.
    expect(params).toEqual([ATHLETE, 'week_drafted', payload, ATHLETE, 'week_drafted', WEEK, ATHLETE, 'week_draft_withdrawn', WEEK]);
    expect(JSON.parse(payload)).toEqual({
      weekStart: WEEK,
      visibleFrom: WEEK,
      sessions: [SESSION],
      citations: [],
      skeleton: draft.skeleton,
    });
  });

  it('reports exists when the guard let nothing through — the loser of two tabs', async () => {
    executeRows = [];
    expect(await recordWeekDraft(draft)).toBe('exists');
  });
});

describe('getPendingWeekDraft — the athlete’s day-early blind spot (training-architecture/17)', () => {
  const row = {
    id: 'd1',
    type: 'week_drafted',
    payload: { weekStart: WEEK, visibleFrom: '2026-09-17', sessions: [SESSION], citations: [] },
    createdAt: new Date('2026-09-16T08:00:00Z'),
  };

  it('with asOf before visibleFrom returns null; on or after it, the draft; without asOf, always the draft', async () => {
    nextRows = [row];
    expect(await getPendingWeekDraft(ATHLETE, WEEK, { asOf: '2026-09-16' })).toBeNull();
    nextRows = [row];
    expect(await getPendingWeekDraft(ATHLETE, WEEK, { asOf: '2026-09-17' })).toMatchObject({ id: 'd1' });
    nextRows = [row];
    expect(await getPendingWeekDraft(ATHLETE, WEEK)).toMatchObject({ id: 'd1' });
  });
});

describe('recordWeekDraftApproval', () => {
  it('writes one head_coach event, attributed to the acting coach, carrying the whole approved week and whether it changed', async () => {
    await recordWeekDraftApproval({
      athleteId: ATHLETE,
      headCoachId: 'coach_1',
      draftId: 'd1',
      weekStart: WEEK,
      visibleFrom: '2026-09-17',
      sessions: [SESSION],
      citations: [],
      changed: true,
    });
    expect(insertValues).toEqual([
      {
        athleteId: ATHLETE,
        actorType: 'head_coach',
        actorId: 'coach_1',
        type: 'week_draft_approved',
        payload: { draftId: 'd1', weekStart: WEEK, visibleFrom: '2026-09-17', sessions: [SESSION], citations: [], changed: true },
      },
    ]);
  });
});

describe('withdrawPreviewDrafts — a link severed mid-preview', () => {
  const preview = (weekStart: string) => ({
    id: `d-${weekStart}`,
    type: 'week_drafted',
    payload: { weekStart, visibleFrom: '2026-09-20', sessions: [], citations: [] },
    createdAt: new Date('2026-09-16T08:00:00Z'),
  });

  it('withdraws a draft the athlete cannot see yet, as a system event that names the draft, and leaves one they can', async () => {
    // 2026-09-16 (Wed): this week is the 14th, next the 21st. This week's draft
    // has been visible since the 13th; next week's is still in preview (visible
    // from the 20th). The two reads come back in that order.
    const visible = { ...preview('2026-09-14'), payload: { ...preview('2026-09-14').payload, visibleFrom: '2026-09-13' } };
    rowsQueue.push([visible], [preview('2026-09-21')]);

    expect(await withdrawPreviewDrafts(ATHLETE, '2026-09-16')).toBe(1);
    expect(insertValues).toEqual([
      {
        athleteId: ATHLETE,
        actorType: 'system',
        actorId: null,
        type: 'week_draft_withdrawn',
        payload: { weekStart: '2026-09-21', draftId: 'd-2026-09-21', reason: 'severed' },
      },
    ]);
  });

  it('withdraws nothing when nothing is pending', async () => {
    nextRows = [];
    expect(await withdrawPreviewDrafts(ATHLETE, '2026-09-16')).toBe(0);
    expect(insertValues).toEqual([]);
  });

  it('reaches the draft two weeks out — the one a Sunday trigger stages for a Monday athlete', async () => {
    // Sunday 2026-09-20, athlete's day Monday, lead one day: the cycle anchors
    // on Monday the 21st, so the draft is for the week of the 28th — two weeks
    // from this week's Monday, not one. Severed that Sunday it must not survive
    // into the athlete's Monday as a draft the departed coach half-shaped.
    const twoOut = { ...preview('2026-09-28'), payload: { ...preview('2026-09-28').payload, visibleFrom: '2026-09-21' } };
    rowsQueue.push([], [], [twoOut]);
    expect(await withdrawPreviewDrafts(ATHLETE, '2026-09-20')).toBe(1);
    expect(insertValues[0]).toMatchObject({ type: 'week_draft_withdrawn', payload: { weekStart: '2026-09-28' } });
  });
});

describe('getCalendarProposalState — what the athlete’s calendar shows (18; nearer week first and the re-draft offer, 24)', () => {
  const drafted = (weekStart: string, visibleFrom = weekStart, at = '2026-09-16T08:00:00Z') => ({
    id: `d-${weekStart}`,
    type: 'week_drafted',
    payload: { weekStart, visibleFrom, sessions: [SESSION], citations: [] },
    createdAt: new Date(at),
  });
  const declined = (weekStart: string) => ({ id: `r-${weekStart}`, type: 'week_plan_declined', payload: { weekStart }, createdAt: new Date('2026-09-16T09:00:00Z') });
  const discussed = (weekStart: string) => ({
    id: `w-${weekStart}`,
    type: 'week_draft_withdrawn',
    payload: { weekStart, draftId: `d-${weekStart}`, reason: 'discussed', conversationId: 'c1' },
    createdAt: new Date('2026-09-16T09:00:00Z'),
  });
  // Wednesday the 16th: this week is the 14th, next the 21st. The two reads
  // are the two weeks' histories, this week first — the nearer week is the
  // one the athlete should decide first (Mads, 2026-09-17).

  it('shows this week’s visible draft before next week’s', async () => {
    rowsQueue.push([drafted('2026-09-14')], [drafted('2026-09-21', '2026-09-16')]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toMatchObject({ kind: 'proposal', draft: { id: 'd-2026-09-14' } });
  });

  it('shows next week’s draft when this week has none, and nothing when it is not visible yet', async () => {
    rowsQueue.push([], [drafted('2026-09-21', '2026-09-16')]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toMatchObject({ kind: 'proposal', draft: { id: 'd-2026-09-21' } });
    rowsQueue.push([], [drafted('2026-09-21', '2026-09-20')]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toBeNull();
  });

  it('points at the conversation a draft moved into while that conversation has decided nothing', async () => {
    rowsQueue.push([], [drafted('2026-09-21'), discussed('2026-09-21')]);
    latestPlanDecision.mockResolvedValue(null);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toEqual({ kind: 'discussing', conversationId: 'c1', weekStart: '2026-09-21' });
    expect(latestPlanDecision).toHaveBeenCalledWith(ATHLETE, 'c1', new Date('2026-09-16T09:00:00Z'));
  });

  it('offers a re-draft for the nearer declined week that holds no coach-planned session', async () => {
    rowsQueue.push([drafted('2026-09-14'), declined('2026-09-14')], []);
    getSessionsForWeek.mockResolvedValue([{ origin: 'athlete' }]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toEqual({ kind: 'redraft-offer', weekStart: '2026-09-14' });
    expect(getSessionsForWeek).toHaveBeenCalledWith(ATHLETE, '2026-09-14');
  });

  it('a week declined in the conversation is offered too — the chat’s cancel is a decline', async () => {
    rowsQueue.push([], [drafted('2026-09-21'), discussed('2026-09-21')]);
    latestPlanDecision.mockResolvedValue('declined');
    getSessionsForWeek.mockResolvedValue([]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toEqual({ kind: 'redraft-offer', weekStart: '2026-09-21' });
  });

  it('offers nothing for a declined week that already has a coach-planned session, a written week, or one never drafted', async () => {
    rowsQueue.push([drafted('2026-09-14'), declined('2026-09-14')], [drafted('2026-09-21'), { ...declined('2026-09-21'), type: 'week_plan_written' }]);
    getSessionsForWeek.mockResolvedValue([{ origin: 'head_coach' }]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toBeNull();
    rowsQueue.push([], []);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toBeNull();
  });
});

describe('getDiscussedWeek — which week a conversation is about (training-architecture/20)', () => {
  const HANDED_AT = new Date('2026-09-16T10:00:00Z');
  const HANDOFF = { payload: { weekStart: '2026-09-21', draftId: 'd', reason: 'discussed', conversationId: 'c1' }, createdAt: HANDED_AT };

  it('returns the week of the newest discussed handoff for this conversation, scoped in SQL, while no decision has followed it', async () => {
    rowsQueue.push([HANDOFF], []);
    expect(await getDiscussedWeek(ATHLETE, 'c1')).toBe('2026-09-21');
    const handoffWhere = boundValues(whereArgs.at(-2));
    expect(handoffWhere).toContain(ATHLETE);
    expect(handoffWhere).toContain('week_draft_withdrawn');
    expect(handoffWhere).toContain('discussed');
    expect(handoffWhere).toContain('c1');
    expect(Object.keys(selectArgs.at(-2) as object)).toEqual(['payload', 'createdAt']);
  });

  // The review's finding: the window outlived the draft it was chosen for. Once
  // the athlete has decided the handed-over week — confirmed or cancelled — the
  // conversation is about this week's remainder again, whatever the Coach
  // proposes next.
  it('returns null once a written or declined decision for this conversation is newer than the handoff', async () => {
    rowsQueue.push([HANDOFF], [{ createdAt: new Date('2026-09-16T11:00:00Z') }]);
    expect(await getDiscussedWeek(ATHLETE, 'c1')).toBeNull();
    const decisionWhere = boundValues(whereArgs.at(-1));
    expect(decisionWhere).toContain(ATHLETE);
    expect(decisionWhere).toContain('week_plan_written');
    expect(decisionWhere).toContain('week_plan_declined');
    expect(decisionWhere).toContain('c1');
    expect(Object.keys(selectArgs.at(-1) as object)).toEqual(['createdAt']);
    // Bounded to decisions after the handoff, not before it: the Date is the
    // one bound value `boundValues` cannot flatten, so it is found directly.
    expect(datesIn(whereArgs.at(-1))).toContainEqual(HANDED_AT);
  });

  it('returns null with no handoff, reading no decisions, and null for a row with no readable week', async () => {
    rowsQueue.push([]);
    expect(await getDiscussedWeek(ATHLETE, 'c1')).toBeNull();
    expect(whereArgs).toHaveLength(1);
    rowsQueue.push([{ payload: { reason: 'discussed', conversationId: 'c1' }, createdAt: HANDED_AT }]);
    expect(await getDiscussedWeek(ATHLETE, 'c1')).toBeNull();
  });
});

describe('getWeekDraftHistory — the week’s history, with a discussed week resolved through its conversation (24)', () => {
  const draft = { id: 'd1', type: 'week_drafted', payload: { weekStart: WEEK, sessions: [], visibleFrom: WEEK }, createdAt: new Date('2026-09-16T08:00:00Z') };
  const handoff = {
    id: 'w',
    type: 'week_draft_withdrawn',
    payload: { weekStart: WEEK, reason: 'discussed', conversationId: 'c1' },
    createdAt: new Date('2026-09-16T09:00:00Z'),
  };

  it('a declined week reads as declined from the rows alone, scoped to the athlete and the week', async () => {
    rowsQueue.push([draft, { id: 'r', type: 'week_plan_declined', payload: { weekStart: WEEK }, createdAt: new Date('2026-09-16T09:00:00Z') }]);
    expect(await getWeekDraftHistory(ATHLETE, WEEK)).toEqual({ kind: 'declined' });
    expect(latestPlanDecision).not.toHaveBeenCalled();
    const bound = boundValues(whereArgs.at(-1));
    expect(bound).toContain(ATHLETE);
    expect(bound).toContain(WEEK);
  });

  it('a discussed week is still discussing while the conversation has decided nothing', async () => {
    rowsQueue.push([draft, handoff]);
    expect(await getWeekDraftHistory(ATHLETE, WEEK)).toEqual({ kind: 'discussing', conversationId: 'c1' });
    expect(latestPlanDecision).toHaveBeenCalledWith(ATHLETE, 'c1', new Date('2026-09-16T09:00:00Z'));
  });

  it('a discussed week becomes declined or written by the conversation’s decision after the handoff', async () => {
    rowsQueue.push([draft, handoff]);
    latestPlanDecision.mockResolvedValue('declined');
    expect(await getWeekDraftHistory(ATHLETE, WEEK)).toEqual({ kind: 'declined' });
    rowsQueue.push([draft, handoff]);
    latestPlanDecision.mockResolvedValue('written');
    expect(await getWeekDraftHistory(ATHLETE, WEEK)).toEqual({ kind: 'written' });
  });
});

describe('the athlete’s own writes on a draft', () => {
  it('recordWeekDraftDecision writes the athlete’s written or declined event with the week, the draft and the sessions', async () => {
    await recordWeekDraftDecision({ athleteId: ATHLETE, type: 'week_plan_written', weekStart: WEEK, draftId: 'd1', sessions: [SESSION] });
    await recordWeekDraftDecision({ athleteId: ATHLETE, type: 'week_plan_declined', weekStart: WEEK, draftId: 'd1', sessions: [] });
    expect(insertValues).toEqual([
      { athleteId: ATHLETE, actorType: 'athlete', actorId: ATHLETE, type: 'week_plan_written', payload: { weekStart: WEEK, draftId: 'd1', sessions: [SESSION] } },
      { athleteId: ATHLETE, actorType: 'athlete', actorId: ATHLETE, type: 'week_plan_declined', payload: { weekStart: WEEK, draftId: 'd1', sessions: [] } },
    ]);
  });

  it('recordWeekDraftDiscussed stages the proposal and withdraws the draft in one batch — the conversation owns the week, or nothing changed', async () => {
    // Two statements used to go separately; a failure between them left the
    // proposal pending with the calendar draft still actionable (CodeRabbit,
    // PR #71). One batch: both land, or neither.
    await recordWeekDraftDiscussed({ athleteId: ATHLETE, weekStart: WEEK, draftId: 'd1', conversationId: 'c1', sessions: [SESSION] });
    expect(batches).toEqual([2]);
    expect(insertValues).toEqual([
      { athleteId: ATHLETE, actorType: 'coach_ai', type: 'week_plan_proposed', payload: { conversationId: 'c1', sessions: [SESSION] } },
      { athleteId: ATHLETE, actorType: 'athlete', actorId: ATHLETE, type: 'week_draft_withdrawn', payload: { weekStart: WEEK, draftId: 'd1', reason: 'discussed', conversationId: 'c1' } },
    ]);
  });
});
