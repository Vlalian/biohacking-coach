import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth-schema';

/**
 * The athlete.
 *
 * `id` is the opaque key ALL training data hangs off. Identity separation
 * (ADR 0006) is structural: login identity lives in better-auth's tables and
 * is reached only through `userId` — no training table carries a name or an
 * email, so a leak of training data alone names nobody.
 *
 * `userId` is nullable by design, not by omission: synthetic athletes are
 * athlete rows with no login (route ticket 05, ballot 1). Roles are rows you
 * *have*, not things you *are* — holding this row makes you an athlete. It is
 * `text` to reference better-auth's `user.id`, which is text. The unique
 * constraint lets one user own at most one athlete while permitting many null
 * rows (Postgres treats nulls as distinct), so the synthetic roster is
 * untouched by it.
 *
 * `syntheticLabel` names an athlete who has *no* user (route 06). A real
 * athlete's name is `user.name`, reached through the join on `userId`; this
 * column is null for them. It labels only the synthetic roster, whose rows have
 * no user row to carry a name. The check constraint makes that structural: a
 * row has either a `userId` or a `syntheticLabel`, never both and never
 * neither — so every name left in this table is fabricated, and ADR 0006's
 * promise holds by construction, not by convention.
 *
 * Column names follow the glossary exactly (route 07): `training_phase`, not
 * `phase`; `training_sessions_per_week`, not the misleading `weekly_session_count`
 * (a "Weekly Session" is the once-a-week Coach ritual — there is only ever one).
 */
export const athlete = pgTable(
  'athlete',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .unique()
      .references(() => user.id),
    syntheticLabel: text('synthetic_label'),
    trainingPhase: text('training_phase'),
    experienceLevel: text('experience_level'),
    communicationStyle: text('communication_style'),
    raceTarget: text('race_target'),
    trainingSessionsPerWeek: integer('training_sessions_per_week'),
    profile: jsonb('profile'),
    equipment: jsonb('equipment'),
    informationViewLayout: jsonb('information_view_layout'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // Exactly one identity anchor is set: a real athlete has a userId and no
    // label; a synthetic athlete has a label and no userId. This is route 06's
    // promise as a database constraint rather than a convention.
    check(
      'athlete_identity_source',
      sql`(${table.userId} IS NULL) <> (${table.syntheticLabel} IS NULL)`,
    ),
  ],
);

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
