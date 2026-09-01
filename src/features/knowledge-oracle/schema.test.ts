import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { knowledgeChunks, knowledgeSources } from '@/db/schema';
import { EMBEDDING_DIMENSIONS } from './embedder';

/**
 * The corpus schema's structural guarantees.
 *
 * Asserted against the schema definition rather than by reading the migration
 * SQL, because the migration is a snapshot of one moment and the schema is what
 * the application actually uses. A future column added to `schema.ts` without a
 * migration would pass a migration-reading test and fail this one, which is the
 * right way round.
 */

const CORPUS_TABLES = [knowledgeSources, knowledgeChunks];

describe('the Knowledge Oracle corpus tables', () => {
  it('carry no athlete column and no foreign key into athlete data', () => {
    for (const table of CORPUS_TABLES) {
      const config = getTableConfig(table);

      for (const column of config.columns) {
        expect(column.name, `${config.name}.${column.name}`).not.toMatch(/athlete/i);
      }

      // The corpus is published training science, not athlete data. ADR 0006's
      // promise — "a leak of the training data alone names nobody" — is not
      // weakened by these tables, and cannot be, because the only relationship
      // they may hold is chunk → source.
      for (const fk of config.foreignKeys) {
        const target = getTableConfig(fk.reference().foreignTable).name;
        expect(target, `${config.name} foreign key`).toBe('knowledge_sources');
      }
    }
  });

  it('cannot be joined to an athlete even by accident', () => {
    // No column typed as a uuid pointing anywhere but knowledge_sources. Stated
    // as a whitelist so a future `session_id` or `conversation_id` fails here.
    const referencing = CORPUS_TABLES.flatMap((table) => {
      const config = getTableConfig(table);
      return config.columns.filter((c) => c.name.endsWith('_id')).map((c) => c.name);
    });

    expect(referencing).toEqual(['source_id']);
  });

  it('sizes the embedding column to the model the embedder uses', () => {
    const embedding = getTableConfig(knowledgeChunks).columns.find(
      (c) => c.name === 'embedding',
    );

    // One fact stored twice — `vector(1536)` in the migration and
    // EMBEDDING_DIMENSIONS in embedder.ts. A disagreement is a runtime insert
    // failure against real Neon, which is the worst place to find it.
    expect(embedding?.getSQLType()).toBe(`vector(${EMBEDDING_DIMENSIONS})`);
  });

  it('requires a licence on every source row', () => {
    const config = getTableConfig(knowledgeSources);
    const names = config.checks.map((c) => c.name);

    // The register's rule, enforced by the database rather than only by
    // `admit()` — which a direct insert can bypass and this cannot.
    expect(names).toContain('knowledge_sources_licence_present');

    for (const column of ['licence', 'licence_url', 'attribution']) {
      const found = config.columns.find((c) => c.name === column);
      expect(found?.notNull, `${column} notNull`).toBe(true);
    }
  });
});
