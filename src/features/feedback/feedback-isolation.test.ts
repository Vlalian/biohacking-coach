import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { athleteFeedback } from '@/db/schema';
import type { Conversation } from '@/features/coach/conversation';
import { selectOpenConversations } from '@/features/coach/conversation';

const { getLatestOpenConversation } = vi.hoisted(() => ({
  getLatestOpenConversation: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/features/coach/conversation-repository', () => ({
  getLatestOpenConversation,
  getMessages: vi.fn(() => Promise.resolve([])),
  createConversation: vi.fn(),
  getOwnedConversation: vi.fn(),
  appendMessages: vi.fn(),
  getOwnedSession: vi.fn(),
}));
vi.mock('@/features/coach/coach-client', () => ({ callCoach: vi.fn() }));
vi.mock('@/features/equipment/equipment-repository', () => ({
  getEquipmentItems: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/features/session/session-repository', () => ({
  getOwnedSession: vi.fn(),
  getSessionsForWeek: vi.fn(() => Promise.resolve([])),
}));

const { getOpenCoachChat } = await import('@/features/coach/coach-chat-service');

function conversation(kind: Conversation['kind'], id: string): Conversation {
  return {
    id,
    athleteId: 'athlete_1',
    kind,
    coachId: null,
    weeklySessionNumber: null,
    createdAt: new Date('2026-09-01T09:00:00Z'),
    endedAt: null,
  };
}

/**
 * The guarantee `showable-version/07` exists to protect: a Feedback Interview is
 * not a Coach conversation, and must never be picked up as one.
 *
 * Feedback typed into Coach Chat does not sit in a file somewhere — Coach Chat
 * resends its whole transcript to the model on every later turn, so "I hated the
 * long runs and this app annoyed me on Tuesday" would be read as something the
 * athlete said about their training for the rest of the test. That is the defect
 * these two tests refuse.
 */

describe('a feedback interview is not a Coach Chat', () => {
  it('is not what getOpenCoachChat asks for', async () => {
    await getOpenCoachChat('athlete_1');

    expect(getLatestOpenConversation).toHaveBeenCalledWith('athlete_1', 'coach_chat');
  });
});

describe('selectOpenConversations', () => {
  it('picks the Weekly Session and the Coach Chat by name', () => {
    const selected = selectOpenConversations([
      conversation('weekly_session', 'conv_weekly'),
      conversation('coach_chat', 'conv_chat'),
    ]);

    expect(selected.weeklySession?.id).toBe('conv_weekly');
    expect(selected.coachChat?.id).toBe('conv_chat');
  });

  it('ignores an open feedback interview entirely', () => {
    // The repository's own doc comment used to promise that "a kind added later
    // needs no extra query at the call site" — true of the query, and exactly
    // wrong for this kind. The shell selects by name for this reason.
    const selected = selectOpenConversations([
      conversation('feedback', 'conv_feedback'),
      conversation('coach_chat', 'conv_chat'),
    ]);

    expect(selected.coachChat?.id).toBe('conv_chat');
    expect(selected.weeklySession).toBeNull();
    expect(Object.values(selected)).not.toContainEqual(
      expect.objectContaining({ id: 'conv_feedback' }),
    );
  });

  it('restores nothing from an interview on its own', () => {
    // A tester whose only open conversation is an interview must open the app
    // to an empty Coach Overlay, not to their own complaint quoted back.
    expect(selectOpenConversations([conversation('feedback', 'conv_feedback')])).toEqual({
      weeklySession: null,
      coachChat: null,
    });
  });
});

describe('the feedback store is not readable from any Head Coach surface', () => {
  /** Every `.ts`/`.tsx` under `src/`, so a new reader cannot be added unnoticed. */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  // Resolved from this file, never from `process.cwd()`: the mutation gate runs
  // the suite from a sandbox copy with a different working directory, where a
  // cwd-relative path silently finds nothing and the assertion below passes
  // while proving nothing.
  const SRC = fileURLToPath(new URL('../..', import.meta.url));

  const readers = sourceFiles(SRC).filter((file) =>
    /athleteFeedback|feedback-repository/.test(readFileSync(file, 'utf8')),
  );

  it('is reached only from the feedback feature and its own server action', () => {
    // `showable-version/07`: "Nothing here is visible to a Head Coach." The
    // Roster, the Coach Briefing and the athlete pages under /coach are all
    // ordinary modules under src/ — if any of them ever read this table, this
    // list grows and the test says so. There is deliberately no by-coach query
    // in the repository for them to call, and this is the guard on that.
    const relative = readers
      .map((file) => file.slice(SRC.length).split(sep).join('/'))
      .sort();

    expect(relative).toEqual([
      'app/[locale]/feedback-actions.ts',
      'db/schema.ts',
      'features/feedback/feedback-repository.ts',
      'features/feedback/feedback-service.ts',
    ]);
  });

  it('never renders a score back to the athlete', () => {
    // CONTEXT.md, Reliance Calibration: never surfaced to the athlete as a score
    // or metric. The interview stores what the tester said and nothing derived
    // from it, so there is no number on this table for a surface to render.
    //
    // Asserted against the table definition rather than the source text on
    // purpose: the mutation gate runs the suite against an instrumented copy of
    // the schema, where the source no longer reads the way it was written.
    const dataTypes = getTableConfig(athleteFeedback).columns.map((c) => c.dataType);

    expect(dataTypes.length).toBeGreaterThan(5);
    expect(dataTypes).not.toContain('number');
  });
});
