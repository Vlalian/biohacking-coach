import type { ChannelMessage } from './messaging-channel';

/**
 * Demo data for the Coaching Channel shell. There is no real Coaching Link
 * data model yet (CONTEXT.md: Coaching Channel is Coached Mode-only, and
 * Coached Mode's messaging is unbuilt) — this fixture exists so the
 * component can be exercised before that lands. Not imported by any
 * reachable route.
 */
export const MOCK_HEAD_COACH_NAME = 'Lene Kirk';

export const MOCK_CHANNEL_MESSAGES: ChannelMessage[] = [
  {
    id: 'm1',
    author: 'head-coach',
    authorName: MOCK_HEAD_COACH_NAME,
    content: "Added a brick session Thursday — want you race-sharp for Kona.",
    timestamp: '2026-08-10T09:00:00Z',
    reference: { label: 'Thu · Brick · 90 min' },
  },
  {
    id: 'm2',
    author: 'athlete',
    authorName: 'You',
    content: 'Got it, thanks — how has my sleep been trending this block?',
    timestamp: '2026-08-10T09:02:00Z',
  },
  {
    id: 'm3',
    author: 'ai-coach',
    authorName: 'AI Coach',
    content: 'Averaging 7.4h over the last two weeks, steady — no flags there.',
    timestamp: '2026-08-10T09:02:30Z',
  },
];
