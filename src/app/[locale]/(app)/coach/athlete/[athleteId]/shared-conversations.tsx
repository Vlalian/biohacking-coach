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
      <h2 className="mb-3 font-display text-2xl font-bold uppercase italic tracking-[0.03em] text-foreground">{t('title')}</h2>
      {transcripts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {transcripts.map((c) => (
            <div key={c.conversationId} className="border border-border bg-panel p-5">
              <div className="mb-3 font-body text-[13px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t(c.kind === 'coach_chat' ? 'kindCoachChat' : 'kindWeeklySession')}
              </div>
              <ol className="flex flex-col gap-2">
                {c.messages.map((m) => (
                  <li key={m.seq} className="font-body text-base leading-relaxed text-foreground">
                    <span className="text-muted-foreground">
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
