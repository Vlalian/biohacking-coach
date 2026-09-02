import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { athleteFeedback, conversations, CONVERSATION_KINDS } from '@/db/schema';
import type { ConversationKind } from '@/features/coach/conversation';

/**
 * The literal SQL a check constraint renders to.
 *
 * A drizzle `SQL` is a tree of chunks — string fragments, columns, and nested
 * `SQL` from `sql.raw` — so the literal list a CHECK is built from is one level
 * down rather than in the top-level chunks. Walked rather than stringified
 * because the tree holds back-references to the table and cannot be serialised.
 */
function checkSql(value: unknown): string {
  const chunks = (value as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return '';
  return chunks
    .map((chunk) => {
      const inner = (chunk as { value?: unknown })?.value;
      if (Array.isArray(inner)) return inner.join('');
      return checkSql(chunk);
    })
    .join('');
}

/**
 * The structural half of `showable-version/07` — the two schema facts the
 * Feedback Interview rests on, pinned so neither can be undone quietly.
 *
 * The cascade this table needs for erasure is NOT asserted here: it is already
 * asserted, for every table below `athlete`, by
 * `src/features/erasure/erasure-schema.test.ts`, which derives the set from the
 * schema rather than listing it. Repeating it here would be a second, weaker
 * copy of a test that already covers this table by construction.
 */

describe('the feedback conversation kind', () => {
  it('is one of the conversation kinds', () => {
    expect(CONVERSATION_KINDS).toContain('feedback');
  });

  it('is a member of the ConversationKind union', () => {
    // A type-level assertion with a runtime shadow: if the union stopped
    // including 'feedback' this line would not compile.
    const kind: ConversationKind = 'feedback';
    expect(kind).toBe('feedback');
  });

  it('reaches the database check constraint from the same constant', () => {
    // The union and the CHECK used to be two lists that had to be edited
    // together, and `showable-version/07` is the third ticket to note it. They
    // are now one list: the check is built from CONVERSATION_KINDS, so a kind
    // added to the type cannot be missing from the constraint.
    const [check] = getTableConfig(conversations).checks;

    expect(check.name).toBe('conversations_kind_valid');
    for (const kind of CONVERSATION_KINDS) {
      expect(checkSql(check.value)).toContain(`'${kind}'`);
    }
  });
});

describe('athlete_feedback', () => {
  const config = getTableConfig(athleteFeedback);
  const columns = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('is keyed to the athlete and to nothing identifying', () => {
    // ADR 0006: the opaque athlete id, and no name, email or user id anywhere.
    expect(columns.athlete_id).toBeDefined();
    expect(columns.athlete_id.notNull).toBe(true);
    expect(Object.keys(columns).sort()).toEqual([
      'athlete_id',
      'body',
      'conversation_id',
      'coach_failure_reason',
      'created_at',
      'id',
      'kind',
      'view',
    ].sort());
  });

  it('accepts only the two kinds of row that are not conversation turns', () => {
    // The transcript lives in `conversations`/`messages` like every other
    // conversation. This table holds the fallback submissions and the Trust
    // Signal answer — the two things that are not turns.
    const check = config.checks.find((c) => c.name === 'athlete_feedback_kind_valid');

    expect(check).toBeDefined();
    expect(checkSql(check!.value)).toContain(`'fallback'`);
    expect(checkSql(check!.value)).toContain(`'trust_signal'`);
  });
});
