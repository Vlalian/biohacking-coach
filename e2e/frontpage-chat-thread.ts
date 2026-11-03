import { PINNED_TODAY } from './pinned-today';

/**
 * The Coach Chat thread the Frontpage's phone picture shows (showable-version/63).
 * The seed holds no conversation and the picture run's Coach is switched off, so
 * a short fixed exchange is written instead (Mads, 2026-11-01). It goes on a
 * public page: no names, no addresses, nothing a real athlete wrote. Rows are
 * timed on the pinned day, so the picture is the same on every run.
 */
type ChatRole = 'athlete' | 'coach_ai';

const EXCHANGE: ReadonlyArray<{ role: ChatRole; content: string }> = [
  {
    role: 'athlete',
    content: 'Work runs late on Thursday. Can I swap the bike intervals with Saturday’s easy run?',
  },
  {
    role: 'coach_ai',
    content:
      'Yes. Saturday gives you the morning for the intervals, and Thursday’s easy run fits around a late day. ' +
      'Keep the run easy, so you come into Saturday fresh. Shall I move them?',
  },
  { role: 'athlete', content: 'Yes, move them.' },
  {
    role: 'coach_ai',
    content: 'Done. Thursday is now the easy run and Saturday the bike intervals. Your coach sees the change.',
  },
];

export function frontpageChatThread({ athleteId, conversationId }: { athleteId: string; conversationId: string }) {
  const at = (minute: number) => new Date(`${PINNED_TODAY}T08:${String(minute).padStart(2, '0')}:00Z`);
  return {
    conversation: { id: conversationId, athleteId, kind: 'coach_chat' as const, endedAt: null, createdAt: at(0) },
    messages: EXCHANGE.map((message, i) => ({
      conversationId,
      role: message.role,
      content: message.content,
      seq: i + 1,
      createdAt: at(i + 1),
    })),
  };
}
