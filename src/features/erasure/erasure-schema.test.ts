import { describe, it, expect } from 'vitest';
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as appSchema from '@/db/schema';
import * as authSchema from '@/db/auth-schema';

/**
 * The automated proof that erasure reaches everything — and the reason it is
 * shaped like this rather than as the integration test PRIV-3 asks for.
 *
 * `docs/nfr.md` PRIV-3 names its fit criterion as *"erasure removes all of an
 * athlete's rows — verified by an erasure integration test"*. This repository
 * cannot run one: `getDb()` speaks Neon over HTTP, `vitest.config.ts` has no
 * setup file and no PGlite or testcontainers, and every repository test mocks
 * the drizzle chain. Introducing a test database is its own ticket and was
 * deliberately kept out of `showable-version/10`.
 *
 * So the proof is taken one level up, at the schema. That is not a consolation
 * prize — it has **more** teeth than an integration test would for the failure
 * that will actually happen. An integration test written today would assert that
 * today's fourteen tables are erased; it would stay green when someone adds a
 * fifteenth table hanging off `athlete` in six months and forgets the cascade,
 * because it would never have heard of that table. This walks the schema, so a
 * new table is covered the moment it is declared.
 *
 * What it does not prove is that Postgres executes a declared cascade. That is
 * not the thing that will break, and the one-time live verification against the
 * real database (`showable-version/01`) is where it is checked.
 */

type Edge = { table: string; column: string; parent: string; onDelete?: string };

/** Every foreign key in the app + auth schemas, as child → parent edges. */
function foreignKeyEdges(): Edge[] {
  const edges: Edge[] = [];
  for (const value of [...Object.values(appSchema), ...Object.values(authSchema)]) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    for (const fk of config.foreignKeys) {
      const reference = fk.reference();
      edges.push({
        table: config.name,
        column: reference.columns.map((c) => c.name).join(','),
        parent: getTableConfig(reference.foreignTable).name,
        onDelete: fk.onDelete,
      });
    }
  }
  return edges;
}

/**
 * Every table reachable downward from `athlete` — its children, their children,
 * and so on. This is exactly the set that a `DELETE FROM athlete` has to take
 * with it, derived rather than listed, so nothing can be forgotten from it.
 */
function tablesBelowAthlete(edges: Edge[]): Set<string> {
  const reachable = new Set<string>(['athlete']);
  for (let changed = true; changed; ) {
    changed = false;
    for (const edge of edges) {
      if (reachable.has(edge.parent) && !reachable.has(edge.table)) {
        reachable.add(edge.table);
        changed = true;
      }
    }
  }
  reachable.delete('athlete');
  return reachable;
}

describe('erasure reaches every table below the athlete', () => {
  const edges = foreignKeyEdges();

  it('finds the tables that hang off an athlete', () => {
    // A guard on the guard: if this ever came back empty the cascade assertion
    // below would pass vacuously and prove nothing.
    expect(tablesBelowAthlete(edges).size).toBeGreaterThan(5);
  });

  /**
   * Everything a `DELETE FROM athlete` actually removes: reachable from
   * `athlete` following **cascading edges only**.
   */
  function tablesErasedByCascade(input: Edge[]): Set<string> {
    const reachable = new Set<string>(['athlete']);
    for (let changed = true; changed; ) {
      changed = false;
      for (const edge of input) {
        if (edge.onDelete !== 'cascade') continue;
        if (reachable.has(edge.parent) && !reachable.has(edge.table)) {
          reachable.add(edge.table);
          changed = true;
        }
      }
    }
    reachable.delete('athlete');
    return reachable;
  }

  it('leaves no table below athlete without a cascading path to it', () => {
    // Asked per TABLE, not per EDGE — a correction, not a relaxation.
    //
    // The question this guard exists to answer is "would an erasure leave rows
    // behind?", and rows are left behind only when NO cascading path reaches
    // their table. One non-cascading edge does not mean that.
    //
    // The per-edge form gave a false positive as soon as a table had two
    // parents. `detected_activities` hangs off `athlete` with a cascade, so an
    // erasure takes every row of it — and it *also* points sideways at
    // `sessions` with `set null`, which is deliberate: deleting a session must
    // not destroy an uploaded activity the athlete has not resolved yet.
    // Cascading that edge to satisfy the old rule would have quietly deleted
    // athlete data, which is the exact harm showable-version/14 exists to
    // remove.
    //
    // Nothing the old rule caught escapes this one. A table whose only path up
    // is non-cascading is still unreachable and still fails; a new table added
    // without a cascade has no path at all and still fails. What no longer
    // fails is a table that is genuinely erased. The test below proves it.
    const below = tablesBelowAthlete(edges);
    const erased = tablesErasedByCascade(edges);

    const leftBehind = [...below]
      .filter((table) => !erased.has(table))
      .map((table) => {
        const parents = edges
          .filter((e) => e.table === table)
          .map((e) => `${e.column} -> ${e.parent} (onDelete: ${e.onDelete})`);
        return `${table}: ${parents.join('; ')}`;
      });

    expect(
      leftBehind,
      'a table below athlete has no cascading path to it — an erasure would leave its rows behind',
    ).toEqual([]);
  });

  it('still reports a table whose only path up does not cascade', () => {
    // A guard on the correction: proves the looser-looking rule is not loose.
    // A fabricated child of `sessions` that only ever `set null`s is below
    // athlete and unreachable by cascade, so it must not be treated as erased.
    const fabricated: Edge[] = [
      ...edges,
      { table: 'orphan_table', column: 'session_id', parent: 'sessions', onDelete: 'set null' },
    ];

    expect(tablesBelowAthlete(fabricated).has('orphan_table')).toBe(true);
    expect(tablesErasedByCascade(fabricated).has('orphan_table')).toBe(false);
  });
});

describe('erasure can delete a Head Coach account', () => {
  it('cascades every foreign key pointing at coach', () => {
    // Found 2026-08-27 while planning `showable-version/10`: `conversations.coachId`
    // declared no `onDelete` at all. A Coach Briefing carries `coachId` = the coach
    // and `athleteId` = *the athlete it is about*, so a coach's briefings about
    // other athletes are keyed to those athletes' ids and are never touched by
    // this coach's own erasure. The coach row stayed referenced and the DELETE
    // threw — erasure worked for athletes and not for Head Coaches, which is half
    // the tester audience (`showable-version/04`), and CONTEXT.md is explicit that
    // one account can hold both capacities.
    const notCascading = foreignKeyEdges()
      .filter((e) => e.parent === 'coach' && e.onDelete !== 'cascade')
      .map((e) => `${e.table}.${e.column} -> coach (onDelete: ${e.onDelete})`);

    expect(notCascading).toEqual([]);
  });
});

describe('the delete order is forced by the schema', () => {
  // Pins the assumption `erasurePlan` rests on. If someone later makes these
  // cascade, the ordering rationale in `erasure.ts` stops being true and this
  // test says so rather than letting the comment quietly rot.
  it('does not cascade the identity foreign keys, which is why user is deleted last', () => {
    const identityEdges = foreignKeyEdges().filter(
      (e) => e.parent === 'user' && (e.table === 'athlete' || e.table === 'coach'),
    );

    expect(identityEdges).toHaveLength(2);
    for (const edge of identityEdges) {
      expect(edge.onDelete, `${edge.table}.${edge.column}`).not.toBe('cascade');
    }
  });
});
