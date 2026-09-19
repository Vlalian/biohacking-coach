import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * The Roster's shared-transcript reader — a Head Coach's read-only view of the
 * athlete's Coach conversations while `share_ai_transcripts` is on.
 *
 * Pinned for `training-architecture/21`: the Weekly Session is retired and
 * nothing writes the kind any more, but the rows already written are the
 * athlete's history and this reader must keep rendering them, labelled.
 */
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => `${key}()`,
}));

const { SharedConversations } = await import('./shared-conversations');

describe('SharedConversations', () => {
  it('renders an old weekly_session transcript beside a coach_chat, each under its own kind', async () => {
    const html = renderToStaticMarkup(
      await SharedConversations({
        transcripts: [
          {
            conversationId: 'w1',
            kind: 'weekly_session',
            createdAt: new Date('2026-08-03'),
            messages: [
              { role: 'athlete', content: 'in rhythm', seq: 0 },
              { role: 'coach_ai', content: 'then we build', seq: 1 },
              { role: 'head_coach', content: 'agreed', seq: 2 },
            ],
          },
          {
            conversationId: 'c1',
            kind: 'coach_chat',
            createdAt: new Date('2026-09-14'),
            messages: [{ role: 'athlete', content: 'legs heavy', seq: 0 }],
          },
        ],
      }),
    );
    expect(html).toContain('kindWeeklySession()');
    expect(html).toContain('in rhythm');
    expect(html).toContain('then we build');
    expect(html).toContain('roleHeadCoach()');
    expect(html).toContain('kindCoachChat()');
    expect(html).toContain('legs heavy');
  });

  it('says so when nothing is shared yet', async () => {
    const html = renderToStaticMarkup(await SharedConversations({ transcripts: [] }));
    expect(html).toContain('empty()');
  });
});
