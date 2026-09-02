import { getLatestBriefingWithMessages } from '@/features/coach/conversation-repository';
import { loadCoachAthlete, NotACoach } from '../coach-athlete-guard';
import { Briefing } from '../briefing';
import { SharedConversations } from '../shared-conversations';

// Per-request: depends on the signed-in coach and the requested athlete.
export const dynamic = 'force-dynamic';

/**
 * What has been said about this athlete: the Coach Briefing, and — only where
 * the athlete has opted into sharing them — their own Coach transcripts.
 *
 * They share a tab because they are the same question asked twice: what the
 * Coach knows, and what the athlete said unguarded.
 */
export default async function CoachAthleteBriefingPage({
  params,
}: {
  params: Promise<{ locale: string; athleteId: string }>;
}) {
  const { locale, athleteId } = await params;
  const context = await loadCoachAthlete(locale, athleteId);
  if (!context.ok) return <NotACoach />;

  // Restored so a refresh does not lose the conversation (ADR 0006 — the
  // transcript is server-side, not browser state). Link Visibility gated the
  // material when it was built; this only carries the persisted turns.
  const briefing = await getLatestBriefingWithMessages(context.coach.id, athleteId);

  return (
    <>
      {/* Shown only when share_ai_transcripts is on — the service returns null
          otherwise, so nothing was ever fetched to withhold. */}
      {context.view.sharedTranscripts && (
        <SharedConversations transcripts={context.view.sharedTranscripts} />
      )}
      <Briefing
        athleteId={athleteId}
        initial={
          briefing
            ? {
                conversationId: briefing.conversation.id,
                messages: briefing.messages.map((m) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  seq: m.seq,
                })),
              }
            : null
        }
      />
    </>
  );
}
