import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { detectedActivities, sessions, sessionStreams } from '@/db/schema';
import type { ParsedSession } from './garmin';

/**
 * `garmin-integration/03` — writing an uploaded history. The database is a
 * recording fake: every statement the service builds is kept, so the tests
 * read what would have been written, and the batch is what would have run.
 */
type Stmt = { kind: 'insert' | 'delete'; table: unknown; values?: unknown; where?: SQL; conflict?: boolean };
const statements: Stmt[] = [];
const selects = new Map<unknown, unknown[]>();
/** Every read the service made: what it projected, from which table, under what filter. */
const reads: { fields: Record<string, unknown>; table: unknown; where: SQL }[] = [];

const { batch, getAthleteById, athleteProfileMerge, getSessionsOnDates, ensureBlockFilled, ensureWeekDrafted } = vi.hoisted(() => ({
  batch: vi.fn((_s: unknown[]) => Promise.resolve()),
  getAthleteById: vi.fn(),
  athleteProfileMerge: vi.fn((athleteId: string, changes: Record<string, unknown>) => ({ lock: { athleteId, changes } })),
  getSessionsOnDates: vi.fn(async (_a: string, _d: string[]) => [] as unknown[]),
  ensureBlockFilled: vi.fn(),
  ensureWeekDrafted: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: (where: SQL) => {
          reads.push({ fields, table, where });
          return Promise.resolve(selects.get(table) ?? []);
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        const stmt: Stmt = { kind: 'insert', table, values };
        statements.push(stmt);
        return Object.assign(stmt, {
          onConflictDoNothing: () => Object.assign(stmt, { conflict: true }),
        });
      },
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        const stmt: Stmt = { kind: 'delete', table, where };
        statements.push(stmt);
        return stmt;
      },
    }),
    batch,
  }),
}));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteById, athleteProfileMerge }));
vi.mock('@/features/session/session-repository', () => ({ getSessionsOnDates }));
vi.mock('@/features/coach/block-fill-service', () => ({ ensureBlockFilled }));
vi.mock('@/features/coach/week-draft-service', () => ({ ensureWeekDrafted }));

const { importTrainingHistory, removeImportedHistory, countImportedHistory } = await import('./history-import-service');

const TODAY = '2026-09-24';

function parsed(over: Partial<ParsedSession> = {}): ParsedSession {
  return {
    date: '2026-08-01',
    sessionType: 'Endurance',
    duration: 45,
    note: 'Imported from Garmin',
    startTime: 'T1',
    sport: 'running',
    summary: { avgHr: 140, maxHr: null, avgSpeedMps: null, distanceM: null, ascentM: null, avgPowerW: null },
    streams: { t: [0] } as unknown as ParsedSession['streams'],
    ...over,
  };
}

const athlete = (profile: Record<string, unknown> | null = null) => ({ id: 'a1', profile });

function inserted(table: unknown): Record<string, unknown>[] {
  return statements.filter((s) => s.kind === 'insert' && s.table === table).flatMap((s) => s.values as Record<string, unknown>[]);
}
const insertedSessions = () => inserted(sessions);
/** The profile keys the batch's lock statement merges in. */
function profileWrite() {
  const lock = (batch.mock.calls[0][0] as { lock?: { changes: unknown } }[]).find((s) => s.lock);
  return lock?.lock?.changes;
}
function renderedDelete() {
  const del = statements.find((s) => s.kind === 'delete')!;
  return new PgDialect().sqlToQuery(del.where!);
}

beforeEach(() => {
  vi.clearAllMocks();
  statements.length = 0;
  reads.length = 0;
  selects.clear();
  getAthleteById.mockResolvedValue(athlete());
  getSessionsOnDates.mockResolvedValue([]);
});

describe('importTrainingHistory', () => {
  it('writes history as completed garmin sessions and sets the lock', async () => {
    expect(await importTrainingHistory('a1', [parsed({ startTime: 'T1' })], TODAY)).toEqual({ ok: true, imported: 1, proposed: 0 });
    expect(insertedSessions()).toEqual([
      expect.objectContaining({
        athleteId: 'a1',
        date: '2026-08-01',
        type: 'Endurance',
        origin: 'garmin',
        status: 'completed',
        externalId: 'garmin:T1',
        duration: 45,
        sport: 'running',
        note: 'Imported from Garmin',
        feedbackBody: null,
        feedbackMind: null,
        feedbackComment: null,
        ratedAt: null,
        isTraining: true,
      }),
    ]);
    expect(profileWrite()).toEqual({ historyImportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    expect(athleteProfileMerge).toHaveBeenCalledWith('a1', expect.anything());
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('keeps the device’s start time and summary, and stores the streams against the new session', async () => {
    await importTrainingHistory('a1', [parsed({ startTime: '2026-08-01T06:30:00.000Z' })], TODAY);
    const [row] = insertedSessions();
    expect(row.startTime).toEqual(new Date('2026-08-01T06:30:00.000Z'));
    expect(row.summary).toEqual(expect.objectContaining({ avgHr: 140 }));
    expect(inserted(sessionStreams)).toEqual([{ sessionId: row.id, samples: { t: [0] } }]);
    expect(row.id).toEqual(expect.any(String));
  });

  it('skips an activity already on file under the unique index rather than failing', async () => {
    await importTrainingHistory('a1', [parsed()], TODAY);
    expect(statements.find((s) => s.table === sessions)?.conflict).toBe(true);
  });

  it('refuses while an import is on file', async () => {
    getAthleteById.mockResolvedValue(athlete({ historyImportedAt: '2026-09-20T10:00:00.000Z' }));
    expect(await importTrainingHistory('a1', [parsed()], TODAY)).toEqual({ ok: false, reason: 'locked' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses an athlete it cannot find', async () => {
    getAthleteById.mockResolvedValue(undefined);
    expect(await importTrainingHistory('a1', [parsed()], TODAY)).toEqual({ ok: false, reason: 'locked' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('sends an activity on a planned day to detection, stamped, and matched to that session', async () => {
    getSessionsOnDates.mockResolvedValue([
      { id: 's1', date: '2026-08-02', type: 'Endurance', status: 'planned', parked: false, dayOrder: 0, duration: 60, zone: null },
    ]);
    const result = await importTrainingHistory('a1', [parsed({ date: '2026-08-01', startTime: 'A' }), parsed({ date: '2026-08-02', startTime: 'B' })], TODAY);

    expect(result).toEqual({ ok: true, imported: 1, proposed: 1 });
    expect(getSessionsOnDates).toHaveBeenCalledWith('a1', ['2026-08-01', '2026-08-02']);
    expect(inserted(detectedActivities)).toEqual([
      expect.objectContaining({ athleteId: 'a1', date: '2026-08-02', externalId: 'garmin:B', matchedSessionId: 's1' }),
    ]);
    expect(insertedSessions().map((r) => r.date)).toEqual(['2026-08-01']);
  });

  it('does not import again what is already on file, as history or as a proposal', async () => {
    selects.set(sessions, [{ externalId: 'garmin:T0' }]);
    selects.set(detectedActivities, [{ externalId: 'garmin:T2' }]);
    const result = await importTrainingHistory(
      'a1',
      [parsed({ startTime: 'T0' }), parsed({ startTime: 'T1' }), parsed({ startTime: 'T2' })],
      TODAY,
    );
    expect(result).toEqual({ ok: true, imported: 1, proposed: 0 });
    expect(insertedSessions().map((r) => r.externalId)).toEqual(['garmin:T1']);
  });

  it('reads the ids on file from both places, this athlete’s only', async () => {
    await importTrainingHistory('a1', [parsed()], TODAY);
    expect(reads.map((r) => [r.table, Object.keys(r.fields)])).toEqual([
      [sessions, ['externalId']],
      [detectedActivities, ['externalId']],
    ]);
    for (const read of reads) {
      const { sql, params } = new PgDialect().sqlToQuery(read.where);
      expect(params).toEqual(['a1']);
      expect(sql).toMatch(/"athlete_id" = \$1 and .*"external_id" is not null/);
    }
  });

  it('writes only the lock when everything was already on file', async () => {
    selects.set(sessions, [{ externalId: 'garmin:T1' }]);
    expect(await importTrainingHistory('a1', [parsed({ startTime: 'T1' })], TODAY)).toEqual({ ok: true, imported: 0, proposed: 0 });
    expect(batch.mock.calls[0][0]).toHaveLength(1);
    expect(profileWrite()).toEqual({ historyImportedAt: expect.any(String) });
  });

  it('writes nothing and keeps the import open when there is nothing to import', async () => {
    expect(await importTrainingHistory('a1', [], TODAY)).toEqual({ ok: true, imported: 0, proposed: 0 });
    expect(batch).not.toHaveBeenCalled();
    expect(athleteProfileMerge).not.toHaveBeenCalled();
  });

  it('leaves the plan alone — history counts from the next draft on', async () => {
    await importTrainingHistory('a1', [parsed()], TODAY);
    expect(ensureBlockFilled).not.toHaveBeenCalled();
    expect(ensureWeekDrafted).not.toHaveBeenCalled();
  });
});

describe('removeImportedHistory', () => {
  it('removes every imported history session and clears the lock, in one batch', async () => {
    await removeImportedHistory('a1');
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
    const { sql, params } = renderedDelete();
    expect(params).toEqual(['a1', 'garmin']);
    expect(sql).toBe('("sessions"."athlete_id" = $1 and "sessions"."origin" = $2)');
    expect(profileWrite()).toEqual({ historyImportedAt: null });
    expect(athleteProfileMerge).toHaveBeenCalledWith('a1', { historyImportedAt: null });
  });
});

describe('countImportedHistory', () => {
  it('counts the athlete’s imported history sessions', async () => {
    selects.set(sessions, [{ n: 42 }]);
    expect(await countImportedHistory('a1')).toBe(42);
    expect(Object.keys(reads[0].fields)).toEqual(['n']);
    const { sql, params } = new PgDialect().sqlToQuery(reads[0].where);
    expect(params).toEqual(['a1', 'garmin']);
    expect(sql).toBe('("sessions"."athlete_id" = $1 and "sessions"."origin" = $2)');
  });

  it('is zero when there is none', async () => {
    expect(await countImportedHistory('a1')).toBe(0);
  });
});
