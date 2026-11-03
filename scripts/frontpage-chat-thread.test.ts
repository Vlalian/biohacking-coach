import { describe, it, expect } from 'vitest';
import { frontpageChatThread } from '../e2e/frontpage-chat-thread';

/** showable-version/63: the fixed thread the Frontpage's phone picture shows. */
describe('frontpage Coach Chat thread', () => {
  it('is an open coach_chat conversation of alternating athlete and coach messages with no names', () => {
    const { conversation, messages } = frontpageChatThread({ athleteId: 'a1', conversationId: 'c1' });
    expect(conversation).toMatchObject({ id: 'c1', athleteId: 'a1', kind: 'coach_chat', endedAt: null });
    expect(messages.map((m) => m.seq)).toEqual(messages.map((_, i) => i + 1));
    expect(messages[0].role).toBe('athlete');
    expect(messages.at(-1)?.role).toBe('coach_ai');
    messages.forEach((m, i) => expect(m.role).toBe(i % 2 === 0 ? 'athlete' : 'coach_ai'));
    expect(messages.length).toBeGreaterThanOrEqual(2);
    const text = messages.map((m) => m.content).join(' ');
    expect(text).not.toMatch(/weekly/i);
    expect(text).not.toMatch(/Mads|Riley|@/);
  });

  it('says something in every message, and ends on the line the picture run waits for', () => {
    const { messages } = frontpageChatThread({ athleteId: 'a1', conversationId: 'c1' });
    for (const m of messages) expect(m.content.trim().length).toBeGreaterThan(10);
    // e2e/frontpage-screenshots.shot.ts waits for this text before the phone picture.
    expect(messages.at(-1)?.content).toContain('Thursday is now the easy run');
    expect(messages[0].content).toContain('Thursday');
    // A conversation, not a command: Momentum gives its reason, then asks before it moves anything.
    expect(messages[1].content).toContain('Saturday gives you the morning for the intervals');
    expect(messages[1].content).toMatch(/Shall I move them\?$/);
  });

  // CodeRabbit on PR #133: the thread is public copy on the Frontpage; any change to it is deliberate.
  it('is exactly the approved exchange', () => {
    const { messages } = frontpageChatThread({ athleteId: 'a1', conversationId: 'c1' });
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ['athlete', 'Work runs late on Thursday. Can I swap the bike intervals with Saturday’s easy run?'],
      [
        'coach_ai',
        'Yes. Saturday gives you the morning for the intervals, and Thursday’s easy run fits around a late day. ' +
          'Keep the run easy, so you come into Saturday fresh. Shall I move them?',
      ],
      ['athlete', 'Yes, move them.'],
      ['coach_ai', 'Done. Thursday is now the easy run and Saturday the bike intervals. Your coach sees the change.'],
    ]);
  });

  it('is timed on the pinned day, oldest first, so the picture is the same on every run', () => {
    const { conversation, messages } = frontpageChatThread({ athleteId: 'a1', conversationId: 'c1' });
    expect(conversation.createdAt.toISOString()).toBe('2026-09-10T08:00:00.000Z');
    expect(messages.map((m) => m.createdAt.toISOString())).toEqual([
      '2026-09-10T08:01:00.000Z',
      '2026-09-10T08:02:00.000Z',
      '2026-09-10T08:03:00.000Z',
      '2026-09-10T08:04:00.000Z',
    ]);
    expect(messages.every((m) => m.conversationId === 'c1')).toBe(true);
  });
});
