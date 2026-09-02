import { randomUUID } from 'node:crypto';
import { cosineDistance, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { knowledgeChunks, knowledgeSources } from '@/db/schema';
import type { CorpusSource } from './corpus-manifest';
import type { ChunkToWrite, KnowledgeRepository } from './ingest';
import type { ChunkSearchResult, KnowledgeSearch } from './retrieval';

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

      // **Everything this function writes goes in one `batch`.** The neon-http
      // driver has no interactive transactions (`db.transaction` throws) but
      // sends a batch as a single one, so metadata, chunks and the digest that
      // vouches for them land together or not at all.
      //
      // That ruled out the obvious shape. An upsert would have to be awaited to
      // learn the row id the chunks reference, and an awaited upsert is a commit
      // outside the batch: if the batch then failed, the row kept this run's
      // licence and attribution while its chunks and digest stayed from the run
      // before — one version's metadata vouching for another version's text, in
      // a table whose whole purpose is to say where a cited passage came from.
      //
      // So the id is settled first with a read, and the write is one statement
      // either way.
      const [existing] = await db
        .select({ id: knowledgeSources.id })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.slug, source.slug))
        .limit(1);

      // A brand-new source gets its id here rather than from the database, which
      // is what lets its chunks be written in the same statement that creates it.
      const id = existing?.id ?? randomUUID();

      const metadata = {
        title: source.title,
        authors: source.authors,
        year: source.year,
        doi: source.doi || null,
        pmcid: source.pmcid,
        // The licence is refreshed on every ingest on purpose: the register goes
        // stale, and a re-ingest is the moment its current reading should land in
        // the database rather than the one from last time.
        licence: source.licence,
        licenceUrl: source.licenceUrl,
        attribution: source.attribution,
      };

      // Delete-then-insert rather than diffing: chunk boundaries move when the
      // text changes, so ordinal 3 of the new text is not a version of ordinal 3
      // of the old one and matching them up would be fiction.
      const writeChunks = chunks.length
        ? [
            db.insert(knowledgeChunks).values(
              chunks.map((chunk) => ({
                sourceId: id,
                ordinal: chunk.ordinal,
                text: chunk.text,
                tokenEstimate: chunk.tokenEstimate,
                embedding: chunk.embedding,
              })),
            ),
          ]
        : [];

      if (!existing) {
        // No chunks to clear, and the row does not exist to be updated. The
        // insert precedes the chunks in the same transaction, so their foreign
        // key is satisfied by a row that is not yet visible to anyone else.
        //
        // Two ingests racing on one new slug would both miss it here and mint
        // different ids; the loser's chunks would reference a row its insert did
        // not create, and the whole batch would fail on the foreign key. Loud and
        // atomic, which is the acceptable end of that trade — and `corpus:ingest`
        // is a single sequential script, not something run concurrently.
        await db.batch([
          db
            .insert(knowledgeSources)
            .values({ id, slug: source.slug, ...metadata, textDigest }),
          ...writeChunks,
        ]);
        return;
      }

      await db.batch([
        db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, id)),
        ...writeChunks,
        db
          .update(knowledgeSources)
          .set({ ...metadata, textDigest, ingestedAt: new Date() })
          .where(eq(knowledgeSources.id, id)),
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

/**
 * The read side of the corpus — the vector search behind {@link KnowledgeSearch}.
 *
 * A separate factory from {@link knowledgeRepository} because they are separate
 * ports: that one writes during ingest, this one reads on every grounded turn.
 * Same two tables, opposite directions, and no reason for a caller that only
 * reads to hold a handle that can `replaceSource`.
 *
 * Like the write side, no function here takes an `athleteId`. The corpus is
 * published training science, shared by every athlete and owned by none — there
 * is no per-athlete scoping to get wrong because there is no per-athlete data.
 *
 * Plain Postgres with pgvector, per ADR 0005 — no separate vector database. The
 * HNSW index on `knowledge_chunks.embedding` was built for this query and is
 * what keeps it from being a sequential scan.
 */
export function knowledgeSearch(): KnowledgeSearch {
  return {
    async searchChunks(embedding: number[], limit: number): Promise<ChunkSearchResult[]> {
      // Computed once and reused in both the projection and the ORDER BY, so the
      // number that is ranked on is provably the number that is returned. Written
      // twice, they could drift.
      const distance = cosineDistance(knowledgeChunks.embedding, embedding);

      const rows = await getDb()
        .select({
          text: knowledgeChunks.text,
          ordinal: knowledgeChunks.ordinal,
          distance,
          source: knowledgeSources,
        })
        .from(knowledgeChunks)
        .innerJoin(knowledgeSources, eq(knowledgeChunks.sourceId, knowledgeSources.id))
        // Ascending: cosine *distance*, so nearest first. This is the direction
        // the HNSW index is built for.
        .orderBy(distance)
        .limit(limit);

      return rows.map((row) => ({
        text: row.text,
        ordinal: row.ordinal,
        // The rest of the module reasons in similarity, where bigger is better,
        // because a threshold called MIN_SIMILARITY that you had to read as a
        // maximum distance is how a floor gets set upside down.
        similarity: 1 - Number(row.distance),
        source: row.source,
      }));
    },
  };
}
