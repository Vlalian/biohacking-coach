import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { knowledgeChunks, knowledgeSources } from '@/db/schema';
import type { CorpusSource } from './corpus-manifest';
import type { ChunkToWrite, KnowledgeRepository } from './ingest';

/**
 * The only place the corpus is read from and written to Postgres.
 *
 * Unlike every other repository in this codebase, no function here takes an
 * `athleteId` — and that is the point rather than an omission. The corpus is
 * published training science, shared by every athlete and owned by none. There
 * is no per-athlete scoping to get wrong because there is no per-athlete data
 * here, and `knowledge_sources`/`knowledge_chunks` carry no column that could
 * hold one.
 */

export function knowledgeRepository(): KnowledgeRepository {
  return {
    async storedDigest(slug: string): Promise<string | null> {
      const [row] = await getDb()
        .select({ textDigest: knowledgeSources.textDigest })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.slug, slug))
        .limit(1);

      return row?.textDigest ?? null;
    },

    async replaceSource(
      source: CorpusSource,
      textDigest: string,
      chunks: ChunkToWrite[],
    ): Promise<void> {
      const db = getDb();

      // The digest is written last, and never in the same statement as the
      // metadata. It is this row's claim that its chunks match the text it was
      // built from, so it must not become true before the chunks it describes
      // exist. A crash anywhere below leaves the *previous* digest standing,
      // which cannot match the new text, so the next run re-ingests rather than
      // reporting a chunkless source as `unchanged` forever.
      //
      // A source seen for the first time gets the empty string, which no
      // SHA-256 can equal — the same "not current yet" claim, spelled for a
      // NOT NULL column.
      const [row] = await db
        .insert(knowledgeSources)
        .values({
          slug: source.slug,
          title: source.title,
          authors: source.authors,
          year: source.year,
          doi: source.doi || null,
          pmcid: source.pmcid,
          licence: source.licence,
          licenceUrl: source.licenceUrl,
          attribution: source.attribution,
          textDigest: '',
        })
        .onConflictDoUpdate({
          target: knowledgeSources.slug,
          set: {
            title: source.title,
            authors: source.authors,
            year: source.year,
            doi: source.doi || null,
            pmcid: source.pmcid,
            // The licence is refreshed on every ingest on purpose: the register
            // goes stale, and a re-ingest is the moment its current reading
            // should land in the database rather than the one from last time.
            licence: source.licence,
            licenceUrl: source.licenceUrl,
            attribution: source.attribution,
          },
        })
        .returning({ id: knowledgeSources.id });

      // Delete-then-insert rather than diffing: chunk boundaries move when the
      // text changes, so ordinal 3 of the new text is not a version of ordinal 3
      // of the old one and matching them up would be fiction.
      //
      // One `batch` rather than three awaits: the neon-http driver has no
      // interactive transactions (`db.transaction` throws), but it sends a batch
      // as a single transaction — so the old chunks, the new chunks and the
      // digest that vouches for them land together or not at all.
      const clearOldChunks = db
        .delete(knowledgeChunks)
        .where(eq(knowledgeChunks.sourceId, row.id));

      const markCurrent = db
        .update(knowledgeSources)
        .set({ textDigest, ingestedAt: new Date() })
        .where(eq(knowledgeSources.id, row.id));

      if (chunks.length === 0) {
        await db.batch([clearOldChunks, markCurrent]);
        return;
      }

      await db.batch([
        clearOldChunks,
        db.insert(knowledgeChunks).values(
          chunks.map((chunk) => ({
            sourceId: row.id,
            ordinal: chunk.ordinal,
            text: chunk.text,
            tokenEstimate: chunk.tokenEstimate,
            embedding: chunk.embedding,
          })),
        ),
        markCurrent,
      ]);
    },
  };
}

/**
 * A repository that knows nothing and writes nothing.
 *
 * Lets the dry run work without `DATABASE_URL`, so `npm run corpus:ingest`
 * remains runnable on a machine that has never seen the database — at the cost
 * of reporting every source as "ready" rather than "unchanged". The script says
 * which of the two it used; it does not quietly pretend the database was
 * consulted.
 */
export function offlineRepository(): KnowledgeRepository {
  return {
    async storedDigest() {
      return null;
    },
    async replaceSource() {
      throw new Error(
        'offlineRepository cannot write. A live ingest needs DATABASE_URL — this ' +
          'stub exists so a dry run works without one.',
      );
    },
  };
}
