import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

/**
 * The athlete.
 *
 * `id` is the opaque key ALL training data hangs off. Identity separation
 * (ADR 0006) is structural: login identity lives in better-auth's tables and
 * is reached only through `userId` — no training table ever carries a name or
 * an email, so a leak of training data alone names nobody.
 *
 * `userId` is nullable by design, not by omission: synthetic athletes are
 * athlete rows with no login (route ticket 05, ballot 1). Roles are rows you
 * *have*, not things you *are* — holding this row makes you an athlete.
 *
 * The foreign key to `user` arrives with better-auth in slice 02; the column
 * is here now so the seam is right from the first migration.
 */
export const athlete = pgTable('athlete', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  displayName: text('display_name').notNull(),
  phase: text('phase'),
  experienceLevel: text('experience_level'),
  commStyle: text('comm_style'),
  raceTarget: text('race_target'),
  weeklySessionCount: integer('weekly_session_count'),
  profile: jsonb('profile'),
  equipment: jsonb('equipment'),
  infoLayout: jsonb('info_layout'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * The stored shape, not the app's shape.
 *
 * Named `Row` on purpose: only the repository may touch it. The app consumes
 * the domain type from the athlete feature, converted at that boundary, so a
 * column rename stays a repository change rather than a rewrite of every
 * component that happened to read the row.
 */
export type AthleteRow = typeof athlete.$inferSelect;
export type NewAthleteRow = typeof athlete.$inferInsert;
