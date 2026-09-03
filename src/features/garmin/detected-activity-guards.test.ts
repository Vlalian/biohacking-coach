import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
  writableTargetWhere,
  importStateWhere,
  isActiveImport,
  IMPORT_STATE_EVENTS,
} from './detected-activity';

/**
 * The two SQL guards this ticket turns on, read as SQL.
 *
 * Why this file exists, and why it is not folded into `detected-activity.test.ts`:
 * those tests drive the repository through a mocked drizzle chain, and the mock
 * throws the predicate away. That is not a slack mock — a predicate is an opaque
 * object until something renders it — but it means a WHERE clause is invisible
 * there. Mutation testing proved it: mutants on both clauses below survived a
 * suite of 1,155 passing tests.
 *
 * That is exactly how the bug this ticket fixes got in. The acceptance WHERE
 * said `status = 'planned'` while the card offered anything not completed, so
 * accepting onto a skipped session updated no row — and the tests that claimed
 * to cover skipped and displaced sessions passed anyway, because they asserted
 * the SET payload and nothing observed the WHERE.
 *
 * Rendering through `PgDialect` makes the clause a string, so the rule is
 * finally something a test can read.
 */
const dialect = new PgDialect();

function render(where: SQL | undefined) {
  const query = dialect.sqlToQuery(where!);
  return { sql: query.sql, params: query.params };
}

describe('writableTargetWhere — what an acceptance may land on', () => {
  it('refuses only a completed session, matching what the athlete was offered', () => {
    const { sql, params } = render(writableTargetWhere('session_1', 'athlete_1'));

    // `<>` and not `=`: the whole defect was a WHERE narrower than the offer.
    expect(sql).toContain('"sessions"."status" <> ');
    expect(sql).not.toContain('"sessions"."status" = ');
    expect(params).toContain('completed');
    // And never the old rule, under any spelling.
    expect(params).not.toContain('planned');
  });

  it('scopes the write to one session and its owner', () => {
    const { sql, params } = render(writableTargetWhere('session_1', 'athlete_1'));

    // The id arrives from the browser, so ownership is re-checked at write time
    // rather than trusted from the read (ADR 0006).
    expect(sql).toContain('"sessions"."id" = ');
    expect(sql).toContain('"sessions"."athlete_id" = ');
    expect(params).toEqual(expect.arrayContaining(['session_1', 'athlete_1', 'completed']));
  });
});

describe('importStateWhere — which events decide an undo', () => {
  it('asks for both kinds of import event, not just the import', () => {
    const { params } = render(importStateWhere('athlete_1', 'session_1'));

    // Asking only for 'garmin_imported' is the bug: after import → undo → a
    // manual completion, the stale import is still the newest one of its kind.
    expect(params).toContain('garmin_imported');
    expect(params).toContain('garmin_import_undone');
  });

  it('scopes the lookup to this athlete and this session', () => {
    const { sql, params } = render(importStateWhere('athlete_1', 'session_1'));

    expect(sql).toContain('"events"."athlete_id" = ');
    expect(params).toEqual(expect.arrayContaining(['athlete_1', 'session_1']));
  });

  it('reads exactly the events isActiveImport knows how to judge', () => {
    // Pins the two together: adding an event kind to the query without teaching
    // isActiveImport about it would silently make undo refuse on it.
    const { params } = render(importStateWhere('athlete_1', 'session_1'));

    for (const type of IMPORT_STATE_EVENTS) expect(params).toContain(type);
  });
});

describe('isActiveImport — whatever happened last decides', () => {
  it('is an import when the newest event is the import', () => {
    expect(isActiveImport({ type: 'garmin_imported' })).toBe(true);
  });

  it('is not an import when the newest event is an undo', () => {
    expect(isActiveImport({ type: 'garmin_import_undone' })).toBe(false);
  });

  it('is not an import when the session has no import history at all', () => {
    expect(isActiveImport(undefined)).toBe(false);
  });
});
