import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { detectedActivities, historyImport, sessions, sessionStreams } from '@/db/schema';
import type { ParsedSession } from './garmin';

/**
 * `garmin-integration/03` — writing an uploaded history. The database is a
 * recording fake: every statement the service builds is kept, so the tests
 * read what would have been written, and the batch is what would have run.
 */
type Stmt = { kind: 'insert' | 'delete' | 'update'; table: unknown; values?: unknown; where?: SQL; conflict?: boolean };
const statements: Stmt[] = [];
const selects = new Map<unknown, unknown[]>();
/** Every read the service made: what it projected, from which table, under what filter. */
const reads: { fields: Record<string, unknown> | undefined; table: unknown; where: SQL }[] = [];
const limits: number[] = [];
const orders: unknown[][] = [];

const { batch, getAthleteById, athleteProfileMerge, getSessionsOnDates, ensureBlockFilled, ensureWeekDrafted, deleteAthleteBlobs } = vi.hoisted(() => ({
  batch: vi.fn((_s: unknown[]) => Promise.resolve()),
  getAthleteById: vi.fn(),
  athleteProfileMerge: vi.fn((athleteId: string, changes: Record<string, unknown>) => ({ lock: { athleteId, changes } })),
  getSessionsOnDates: vi.fn(async (_a: string, _d: string[]) => [] as unknown[]),
  ensureBlockFilled: vi.fn(),
  ensureWeekDrafted: vi.fn(),
  deleteAthleteBlobs: vi.fn(async (_a: string, _k: string) => {}),
}));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: (where: SQL) => {
          reads.push({ fields, table, where });
          const rows = Promise.resolve(selects.get(table) ?? []);
          const limit = (n: number) => {
            limits.push(n);
            return rows;
          };
          const orderBy = (...by: unknown[]) => {
            orders.push(by);
            return Object.assign(Promise.resolve(selects.get(table) ?? []), { limit });
          };
          return Object.assign(rows, { limit, orderBy });
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
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: (where: SQL) => {
          const stmt: Stmt = { kind: 'update', table, values, where };
          statements.push(stmt);
          return stmt;
        },
      }),
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
vi.mock('./blob-store', () => ({ deleteAthleteBlobs }));

const {
  importTrainingHistory,
  startHistoryImport,
  importProgressWrite,
  removeImportedHistory,
  countImportedHistory,
  getHistoryImport,
  latestHistoryImport,
  importsToResume,
} = await import(
  './history-import-service'
);

/** The progress write every chunk carries — a stand-in, since the batch only has to include it. */
const PROGRESS = { progress: true } as unknown as Parameters<typeof importTrainingHistory>[2];

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

beforeEach(() => {
  vi.clearAllMocks();
  statements.length = 0;
  reads.length = 0;
  limits.length = 0;
  orders.length = 0;
  selects.clear();
  getAthleteById.mockResolvedValue(athlete());
  getSessionsOnDates.mockResolvedValue([]);
});

describe('importTrainingHistory', () => {
  it('writes history as completed garmin sessions, with the chunk’s progress, in one batch', async () => {
    expect(await importTrainingHistory('a1', [parsed({ startTime: 'T1' })], PROGRESS)).toEqual({ imported: 1, proposed: 0 });
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
    expect(batch).toHaveBeenCalledTimes(1);
    const written = batch.mock.calls[0][0];
    expect(written).toHaveLength(3);
    expect(written[0]).toBe(PROGRESS);
  });

  it('no longer takes the lock — that happens when Import is pressed', async () => {
    getAthleteById.mockResolvedValue(athlete({ historyImportedAt: '2026-09-20T10:00:00.000Z' }));
    expect(await importTrainingHistory('a1', [parsed()], PROGRESS)).toEqual({ imported: 1, proposed: 0 });
    expect(athleteProfileMerge).not.toHaveBeenCalled();
    expect(getAthleteById).not.toHaveBeenCalled();
  });

  it('keeps the device’s start time and summary, and stores the streams against the new session', async () => {
    await importTrainingHistory('a1', [parsed({ startTime: '2026-08-01T06:30:00.000Z' })], PROGRESS);
    const [row] = insertedSessions();
    expect(row.startTime).toEqual(new Date('2026-08-01T06:30:00.000Z'));
    expect(row.summary).toEqual(expect.objectContaining({ avgHr: 140 }));
    expect(inserted(sessionStreams)).toEqual([{ sessionId: row.id, samples: { t: [0] } }]);
    expect(row.id).toEqual(expect.any(String));
  });

  it('skips an activity already on file under the unique index rather than failing', async () => {
    await importTrainingHistory('a1', [parsed()], PROGRESS);
    expect(statements.find((s) => s.table === sessions)?.conflict).toBe(true);
  });

  it('sends an activity on a planned day to detection, stamped, and matched to that session', async () => {
    getSessionsOnDates.mockResolvedValue([
      { id: 's1', date: '2026-08-02', type: 'Endurance', status: 'planned', parked: false, dayOrder: 0, duration: 60, zone: null },
    ]);
    const result = await importTrainingHistory(
      'a1',
      [parsed({ date: '2026-08-01', startTime: 'A' }), parsed({ date: '2026-08-02', startTime: 'B' })],
      PROGRESS,
    );

    expect(result).toEqual({ imported: 1, proposed: 1 });
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
      PROGRESS,
    );
    expect(result).toEqual({ imported: 1, proposed: 0 });
    expect(insertedSessions().map((r) => r.externalId)).toEqual(['garmin:T1']);
  });

  it('reads the ids on file from both places, this athlete’s only', async () => {
    await importTrainingHistory('a1', [parsed()], PROGRESS);
    expect(reads.map((r) => [r.table, Object.keys(r.fields!)])).toEqual([
      [sessions, ['externalId']],
      [detectedActivities, ['externalId']],
    ]);
    for (const read of reads) {
      const { sql, params } = new PgDialect().sqlToQuery(read.where);
      expect(params).toEqual(['a1']);
      expect(sql).toMatch(/"athlete_id" = \$1 and .*"external_id" is not null/);
    }
  });

  it('writes only the progress when everything was already on file', async () => {
    selects.set(sessions, [{ externalId: 'garmin:T1' }]);
    expect(await importTrainingHistory('a1', [parsed({ startTime: 'T1' })], PROGRESS)).toEqual({ imported: 0, proposed: 0 });
    expect(batch.mock.calls[0][0]).toEqual([PROGRESS]);
  });

  it('writes only the progress, reading nothing, when the chunk held no activity', async () => {
    expect(await importTrainingHistory('a1', [], PROGRESS)).toEqual({ imported: 0, proposed: 0 });
    expect(batch.mock.calls[0][0]).toEqual([PROGRESS]);
    expect(reads).toEqual([]);
    expect(getSessionsOnDates).not.toHaveBeenCalled();
  });

  it('leaves the plan alone — history counts from the next draft on', async () => {
    await importTrainingHistory('a1', [parsed()], PROGRESS);
    expect(ensureBlockFilled).not.toHaveBeenCalled();
    expect(ensureWeekDrafted).not.toHaveBeenCalled();
  });
});

describe('importProgressWrite', () => {
  it('writes the next counters to this import, only if no other worker moved it first', () => {
    const stmt = importProgressWrite('imp1', 25, {
      blobUrls: ['u2'],
      cursor: 0,
      total: 60,
      done: 60,
      skippedOld: 3,
      failed: 1,
      status: 'importing',
    }) as unknown as Stmt;
    expect(stmt.kind).toBe('update');
    expect(stmt.table).toBe(historyImport);
    expect(stmt.values).toEqual({
      blobUrls: ['u2'],
      cursor: 0,
      total: 60,
      done: 60,
      skippedOld: 3,
      failed: 1,
      status: 'importing',
      updatedAt: expect.any(Date),
    });
    const { sql, params } = new PgDialect().sqlToQuery(stmt.where!);
    expect(sql).toBe('("history_import"."id" = $1 and "history_import"."cursor" = $2)');
    expect(params).toEqual(['imp1', 25]);
  });
});

describe('startHistoryImport', () => {
  it('sets historyImportedAt and inserts an importing row in one batch', async () => {
    const result = await startHistoryImport('a1', ['u1', 'u2']);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
    expect(profileWrite()).toEqual({ historyImportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    expect(athleteProfileMerge).toHaveBeenCalledWith('a1', expect.anything());
    const [row] = inserted(historyImport);
    expect(row).toEqual({ id: expect.any(String), athleteId: 'a1', status: 'importing', blobUrls: ['u1', 'u2'] });
    expect(result).toEqual({ ok: true, importId: row.id });
  });

  it('refuses a second start while the lock is held', async () => {
    getAthleteById.mockResolvedValue(athlete({ historyImportedAt: '2026-09-20T10:00:00.000Z' }));
    expect(await startHistoryImport('a1', ['u1'])).toEqual({ ok: false, reason: 'locked' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses an athlete it cannot find', async () => {
    getAthleteById.mockResolvedValue(undefined);
    expect(await startHistoryImport('a1', ['u1'])).toEqual({ ok: false, reason: 'locked' });
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('removeImportedHistory', () => {
  it('removes every imported history session and every import, and clears the lock, in one batch', async () => {
    await removeImportedHistory('a1');
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(3);
    const [sessionsDelete, importsDelete] = statements.filter((s) => s.kind === 'delete');
    expect(sessionsDelete.table).toBe(sessions);
    const rendered = new PgDialect().sqlToQuery(sessionsDelete.where!);
    expect(rendered.params).toEqual(['a1', 'garmin']);
    expect(rendered.sql).toBe('("sessions"."athlete_id" = $1 and "sessions"."origin" = $2)');
    expect(importsDelete.table).toBe(historyImport);
    expect(new PgDialect().sqlToQuery(importsDelete.where!)).toMatchObject({ sql: '"history_import"."athlete_id" = $1', params: ['a1'] });
    expect(profileWrite()).toEqual({ historyImportedAt: null });
    expect(athleteProfileMerge).toHaveBeenCalledWith('a1', { historyImportedAt: null });
  });

  it('deletes the athlete’s history blobs that are left, after the rows are gone', async () => {
    batch.mockImplementationOnce(async () => {
      expect(deleteAthleteBlobs).not.toHaveBeenCalled();
    });
    await removeImportedHistory('a1');
    expect(deleteAthleteBlobs).toHaveBeenCalledWith('a1', 'history');
  });
});

describe('countImportedHistory', () => {
  it('counts the athlete’s imported history sessions', async () => {
    selects.set(sessions, [{ n: 42 }]);
    expect(await countImportedHistory('a1')).toBe(42);
    expect(Object.keys(reads[0].fields!)).toEqual(['n']);
    const { sql, params } = new PgDialect().sqlToQuery(reads[0].where);
    expect(params).toEqual(['a1', 'garmin']);
    expect(sql).toBe('("sessions"."athlete_id" = $1 and "sessions"."origin" = $2)');
  });

  it('is zero when there is none', async () => {
    expect(await countImportedHistory('a1')).toBe(0);
  });
});

describe('reading imports', () => {
  const ROW = { id: 'imp1', athleteId: 'a1', status: 'importing' };

  it('getHistoryImport reads one import by id', async () => {
    selects.set(historyImport, [ROW]);
    expect(await getHistoryImport('imp1')).toEqual(ROW);
    expect(reads[0].table).toBe(historyImport);
    expect(new PgDialect().sqlToQuery(reads[0].where)).toMatchObject({ sql: '"history_import"."id" = $1', params: ['imp1'] });
    expect(limits).toEqual([1]);
  });

  it('getHistoryImport is undefined for an import that is gone', async () => {
    expect(await getHistoryImport('imp1')).toBeUndefined();
  });

  it('latestHistoryImport reads the athlete’s newest import', async () => {
    selects.set(historyImport, [ROW]);
    expect(await latestHistoryImport('a1')).toEqual(ROW);
    expect(new PgDialect().sqlToQuery(reads[0].where)).toMatchObject({ sql: '"history_import"."athlete_id" = $1', params: ['a1'] });
    expect(new PgDialect().sqlToQuery(orders[0][0] as SQL)).toMatchObject({ sql: '"history_import"."created_at" desc' });
    expect(limits).toEqual([1]);
  });

  it('latestHistoryImport is null when the athlete has none', async () => {
    expect(await latestHistoryImport('a1')).toBeNull();
  });

  it('importsToResume lists the running imports untouched since the cutoff, oldest first, up to the limit', async () => {
    selects.set(historyImport, [{ id: 'imp1' }, { id: 'imp2' }]);
    const cutoff = new Date('2026-09-25T11:59:00Z');
    expect(await importsToResume(cutoff, 5)).toEqual(['imp1', 'imp2']);
    expect(Object.keys(reads[0].fields!)).toEqual(['id']);
    const { sql, params } = new PgDialect().sqlToQuery(reads[0].where);
    expect(sql).toBe('("history_import"."status" = $1 and "history_import"."updated_at" < $2)');
    expect(params).toEqual(['importing', cutoff.toISOString()]);
    expect(new PgDialect().sqlToQuery(orders[0][0] as SQL)).toMatchObject({ sql: '"history_import"."updated_at" asc' });
    expect(limits).toEqual([5]);
  });
});
