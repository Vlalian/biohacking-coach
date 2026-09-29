import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/db';
import { conversations, messages } from '@/db/schema';

/** How many of the athlete's own lines the draft reads (E2). */
export const CHAT_EXCERPT_LINES = 5;

/**
 * The athlete's own most recent Coach Chat lines on or after `sinceKey`
 * ('YYYY-MM-DD'), oldest first — the draft's short excerpt of what they said
 * (`training-architecture/52`, Mads's ruling E2). Their words only: the
 * Coach's turns and every other conversation kind are not read. Scoped to the
 * athlete id in the WHERE (ADR 0006).
 */
export async function getRecentAthleteChatLines(athleteId: string, sinceKey: string): Promise<string[]> {
  const rows = await getDb()
    .select({ content: messages.content })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.athleteId, athleteId),
        eq(conversations.kind, 'coach_chat'),
        eq(messages.role, 'athlete'),
        gte(messages.createdAt, new Date(`${sinceKey}T00:00:00`)),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(CHAT_EXCERPT_LINES);
  return rows.map((r) => r.content).reverse();
}
