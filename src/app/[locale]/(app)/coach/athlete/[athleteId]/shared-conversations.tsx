import { getTranslations } from 'next-intl/server';
import type { SharedTranscript } from '@/features/coach/coach-repository';

/**
 * The athlete's shared AI conversations, read-only, shown to a Head Coach.
 *
 * This surface exists ONLY when the Coaching Link's `share_ai_transcripts` is
 * on — the roster service returns null otherwise and this component is not
 * rendered, so the withheld transcripts were never fetched (Link Visibility at
 * the query, not hidden here). A server component: nothing here is interactive,
 * and the transcripts never become client-fetchable state.
 */
export async function SharedConversations({
  transcripts,
}: {
  transcripts: SharedTranscript[];
}) {
  const t = await getTranslations('Transcripts');

  return (
    <section className="w-full max-w-3xl">
      <h2 className="mb-3 text-lg font-semibold">{t('title')}</h2>
      {transcripts.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {transcripts.map((c) => (
            <div key={c.conversationId} className="rounded-lg border p-4">
              <div className="mb-2 text-xs font-semibold text-neutral-500">
                {t(c.kind === 'coach_chat' ? 'kindCoachChat' : 'kindWeeklySession')}
              </div>
              <ol className="flex flex-col gap-2">
                {c.messages.map((m) => (
                  <li key={m.seq} className="text-sm">
                    <span className="text-neutral-500">
                      {t(m.role === 'athlete' ? 'roleAthlete' : m.role === 'head_coach' ? 'roleHeadCoach' : 'roleCoach')}
                      :{' '}
                    </span>
                    {m.content}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
