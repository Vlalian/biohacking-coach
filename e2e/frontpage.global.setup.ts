import { neon } from '@neondatabase/serverless';
import pageSuiteSetup from './global.setup';
import { frontpageChatThread } from './frontpage-chat-thread';

/** Fixed, so a re-run writes the same thread rather than a second one. */
const CONVERSATION_ID = '0f00f00d-0063-4c00-8a00-000000000063';

/**
 * The name the pictures show for the seed athlete. The seed names that athlete
 * after Mads; the pictures are public, so they carry a fictional name instead
 * (Mads, 2026-11-02). Written on `test/e2e` only, which the next run resets.
 */
const FRONTPAGE_ATHLETE_NAME = 'Jonas Berg';

/**
 * The Frontpage pictures' database (showable-version/63): the page suite's own
 * reset and reseed of `test/e2e`, then the seed athlete renamed to a fictional
 * name and given one fictional Coach Chat thread for the phone picture. It reads
 * no account but `SEED_MADS_EMAIL`.
 */
export default async function frontpageSetup(): Promise<void> {
  await pageSuiteSetup();

  const url = process.env.E2E_DATABASE_URL;
  const email = process.env.SEED_MADS_EMAIL;
  if (!url) throw new Error('E2E_DATABASE_URL is not set');
  if (!email) throw new Error('SEED_MADS_EMAIL is not set — the seed accounts live in .env.local');

  const sql = neon(url);
  const [athlete] = await sql`
    SELECT a.id FROM athlete a JOIN "user" u ON u.id = a.user_id WHERE u.email = ${email}`;
  if (!athlete) throw new Error('The seed athlete was not found after the seed');
  await sql`UPDATE "user" SET name = ${FRONTPAGE_ATHLETE_NAME} WHERE email = ${email}`;

  const { conversation, messages } = frontpageChatThread({ athleteId: athlete.id as string, conversationId: CONVERSATION_ID });
  await sql`
    INSERT INTO conversations (id, athlete_id, kind, ended_at, created_at)
    VALUES (${conversation.id}, ${conversation.athleteId}, ${conversation.kind}, ${conversation.endedAt}, ${conversation.createdAt})
    ON CONFLICT (id) DO NOTHING`;
  for (const message of messages) {
    await sql`
      INSERT INTO messages (conversation_id, role, content, seq, created_at)
      VALUES (${message.conversationId}, ${message.role}, ${message.content}, ${message.seq}, ${message.createdAt})
      ON CONFLICT (conversation_id, seq) DO NOTHING`;
  }
  console.warn(`[frontpage] Coach Chat thread ${conversation.id} written for the seed athlete.`);
}
