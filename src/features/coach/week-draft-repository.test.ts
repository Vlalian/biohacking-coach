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
  c.insert = () => ({ values: (v: unknown) => insertValues.push(v) });
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
vi.mock('./plan-proposal-repository', () => ({ getPendingProposal }));

const { getPendingWeekDraft, recordWeekDraft, recordWeekDraftApproval, withdrawPreviewDrafts, getCalendarProposalState, recordWeekDraftDecision, recordWeekDraftDiscussed } =
  await import('./week-draft-repository');

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
  execute.mockClear();
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

describe('getCalendarProposalState — what the athlete’s calendar shows (training-architecture/18)', () => {
  const drafted = (weekStart: string, visibleFrom = weekStart) => ({
    id: `d-${weekStart}`,
    type: 'week_drafted',
    payload: { weekStart, visibleFrom, sessions: [SESSION], citations: [] },
    createdAt: new Date('2026-09-16T08:00:00Z'),
  });
  // Wednesday the 16th: this week is the 14th, next the 21st. Reads come back
  // next week first, then this week, then the withdrawn-for-discussion row.

  it('shows next week’s visible draft first', async () => {
    rowsQueue.push([drafted('2026-09-21', '2026-09-16')], [drafted('2026-09-14')]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toMatchObject({ kind: 'proposal', draft: { id: 'd-2026-09-21' } });
  });

  it('falls back to this week’s pending draft when next week’s is not visible yet', async () => {
    rowsQueue.push([drafted('2026-09-21', '2026-09-20')], [drafted('2026-09-14')]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toMatchObject({ kind: 'proposal', draft: { id: 'd-2026-09-14' } });
  });

  it('points at the conversation a draft moved into while that conversation’s proposal is still pending', async () => {
    rowsQueue.push([], [], [{ payload: { weekStart: '2026-09-21', draftId: 'd-2026-09-21', reason: 'discussed', conversationId: 'c1' } }]);
    getPendingProposal.mockResolvedValueOnce({ conversationId: 'c1', sessions: [SESSION] });
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toEqual({ kind: 'discussing', conversationId: 'c1', weekStart: '2026-09-21' });
    expect(getPendingProposal).toHaveBeenCalledWith(ATHLETE, 'c1');
  });

  it('shows nothing once the discussed proposal was decided in the conversation, and nothing when nothing was ever drafted', async () => {
    rowsQueue.push([], [], [{ payload: { weekStart: '2026-09-21', draftId: 'd', reason: 'discussed', conversationId: 'c1' } }]);
    getPendingProposal.mockResolvedValueOnce(null);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toBeNull();
    rowsQueue.push([], [], []);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toBeNull();
  });

  it('asks for the discussed withdrawals of exactly the two weeks, reading only the payload', async () => {
    getPendingProposal.mockClear();
    rowsQueue.push([], [], [{ payload: { weekStart: '2026-09-21', draftId: 'd', reason: 'discussed', conversationId: 'c1' } }]);
    getPendingProposal.mockResolvedValueOnce({ conversationId: 'c1', sessions: [] });
    await getCalendarProposalState(ATHLETE, '2026-09-16');
    const bound = boundValues(whereArgs.at(-1));
    expect(bound).toContain('discussed');
    expect(bound).toContain('week_draft_withdrawn');
    expect(bound).toContain('2026-09-21');
    expect(bound).toContain('2026-09-14');
    expect(Object.keys(selectArgs.at(-1) as object)).toEqual(['payload']);
  });

  it('a withdrawn row with no readable week is not a pointer either', async () => {
    getPendingProposal.mockClear();
    rowsQueue.push([], [], [{ payload: { reason: 'discussed', conversationId: 'c1' } }]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toBeNull();
    expect(getPendingProposal).not.toHaveBeenCalled();
  });

  it('a withdrawn row with no readable conversation is not a pointer', async () => {
    getPendingProposal.mockClear();
    rowsQueue.push([], [], [{ payload: { weekStart: '2026-09-21', reason: 'discussed' } }]);
    expect(await getCalendarProposalState(ATHLETE, '2026-09-16')).toBeNull();
    expect(getPendingProposal).not.toHaveBeenCalled();
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

  it('recordWeekDraftDiscussed withdraws the draft as the athlete, naming the conversation it moved into', async () => {
    await recordWeekDraftDiscussed({ athleteId: ATHLETE, weekStart: WEEK, draftId: 'd1', conversationId: 'c1' });
    expect(insertValues).toEqual([
      { athleteId: ATHLETE, actorType: 'athlete', actorId: ATHLETE, type: 'week_draft_withdrawn', payload: { weekStart: WEEK, draftId: 'd1', reason: 'discussed', conversationId: 'c1' } },
    ]);
  });
});
