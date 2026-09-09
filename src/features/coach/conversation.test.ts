import { describe, it, expect } from 'vitest';
import type { ConversationRow, MessageRow } from '@/db/schema';
import {
  coachOwnedOrNull,
  nextSeq,
  ownedOrNull,
  toConversation,
  toMessage,
  type Conversation,
} from './conversation';

describe('nextSeq', () => {
  it('starts a transcript at 0', () => {
    expect(nextSeq([])).toBe(0);
  });

  it('is one past the highest existing seq', () => {
    expect(nextSeq([{ seq: 0 }, { seq: 1 }, { seq: 2 }])).toBe(3);
  });

  it('does not assume the input is already sorted', () => {
    expect(nextSeq([{ seq: 2 }, { seq: 0 }, { seq: 1 }])).toBe(3);
  });
});

describe('ownedOrNull', () => {
  const owned: Conversation = {
    id: 'c1',
    athleteId: 'athlete_1',
    kind: 'weekly_session',
    coachId: null,
    weeklySessionNumber: 1,
    createdAt: new Date(),
    endedAt: null,
  };

  it('returns the conversation to its owner', () => {
    expect(ownedOrNull(owned, 'athlete_1')).toBe(owned);
  });

  it('refuses another athlete', () => {
    expect(ownedOrNull(owned, 'athlete_2')).toBeNull();
  });

  it('refuses a missing conversation', () => {
    expect(ownedOrNull(undefined, 'athlete_1')).toBeNull();
  });
});

describe('coachOwnedOrNull', () => {
  const briefing: Conversation = {
    id: 'b1',
    athleteId: 'athlete_1',
    kind: 'coach_briefing',
    coachId: 'coach_1',
    weeklySessionNumber: null,
    createdAt: new Date(),
    endedAt: null,
  };

  it('returns the briefing to its owning coach', () => {
    expect(coachOwnedOrNull(briefing, 'coach_1')).toBe(briefing);
  });

  it('refuses another coach', () => {
    expect(coachOwnedOrNull(briefing, 'coach_2')).toBeNull();
  });

  it('refuses a missing conversation', () => {
    expect(coachOwnedOrNull(undefined, 'coach_1')).toBeNull();
  });

  it('refuses a conversation that is not a coach_briefing', () => {
    const weekly: Conversation = { ...briefing, kind: 'weekly_session' };
    expect(coachOwnedOrNull(weekly, 'coach_1')).toBeNull();
  });
});

describe('toConversation / toMessage', () => {
  it('narrows kind and role at the boundary', () => {
    const cRow: ConversationRow = {
      id: 'c1',
      athleteId: 'athlete_1',
      kind: 'weekly_session',
      coachId: null,
      weeklySessionNumber: 2,
      createdAt: new Date(),
      endedAt: null,
    };
    expect(toConversation(cRow).kind).toBe('weekly_session');

    const mRow: MessageRow = {
      id: 'm1',
      conversationId: 'c1',
      role: 'coach_ai',
      citations: null,
      content: 'Hello',
      seq: 0,
      createdAt: new Date(),
    };
    expect(toMessage(mRow)).toMatchObject({ role: 'coach_ai', content: 'Hello', seq: 0 });
  });
});

describe('toMessage — the citation channel (code-health/06)', () => {
  const base = {
    id: 'm1',
    conversationId: 'c1',
    role: 'coach_ai',
    content: 'Thursday is easy on purpose.',
    seq: 0,
    createdAt: new Date(),
  };

  const citation = {
    sourceId: 'src_1',
    slug: 'polarized-training',
    title: 'Polarized training intensity distribution',
    authors: 'Seiler S',
    year: 2019,
    url: 'https://doi.org/10.1000/example',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Seiler S (2019), CC BY 4.0',
    ordinals: [3],
  };

  it('reads a stored reference list back unchanged', () => {
    // A reference that vanishes on reload is not evidence of anything, so the
    // list has to survive the round trip exactly as it was written.
    expect(toMessage({ ...base, citations: [citation] } as MessageRow).citations).toEqual([
      citation,
    ]);
  });

  it('reads a message with no references as an empty list, never null', () => {
    // Every athlete turn, and every message stored before the column existed.
    // The UI asks "is this empty?" and should not also have to ask "is it null?".
    expect(toMessage({ ...base, citations: null } as MessageRow).citations).toEqual([]);
  });
});
