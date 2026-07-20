import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  date,
  boolean,
  check,
  index,
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

/**
 * A training session — the POC's calendar entity, now a Postgres row.
 *
 * `athleteId` scopes every session to one athlete; the calendar query filters on
 * it, so an athlete can only ever read their own rows (ADR 0006 — training data
 * keys off the opaque athlete id, never a user identity).
 *
 * `origin` is the authority column every later slice guards on: a Prescribed
 * Session is `origin = 'head_coach'`, a Garmin import is `'garmin'` and
 * read-only by construction, and so on. Only seeded `coach`/`athlete` rows exist
 * in this slice, but the column lands now — adding it later would cost a
 * migration and a rewrite of the guards.
 *
 * `dayOrder` orders sessions within a single day (a Double is two sessions on
 * one date); the calendar reads them in that order.
 *
 * Feedback lives inline as two 1–5 smiley scores plus a comment (Body + Mind,
 * the POC's Session Feedback), written when the athlete rates a session. Garmin
 * provenance (`startTime`, `sport`, `summary`) is null until slice 06 imports
 * real files. None of it is read yet — this slice renders the plan — but the
 * column set is the full signed-off shape so later slices add behaviour, not
 * columns.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    type: text('type').notNull(),
    origin: text('origin').notNull(),
    status: text('status').notNull().default('planned'),
    parked: boolean('parked').notNull().default(false),
    isTraining: boolean('is_training').notNull().default(true),
    duration: integer('duration'),
    zone: text('zone'),
    note: text('note'),
    title: text('title'),
    dayOrder: integer('day_order').notNull().default(0),
    // Garmin provenance — populated by slice 06's import, null before it.
    startTime: timestamp('start_time'),
    sport: text('sport'),
    summary: jsonb('summary'),
    // Session Feedback — two 1–5 smiley scores and a comment, set on rating.
    feedbackBody: integer('feedback_body'),
    feedbackMind: integer('feedback_mind'),
    feedbackComment: text('feedback_comment'),
    ratedAt: timestamp('rated_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // The calendar always reads sessions for one athlete; index that path.
    index('sessions_athlete_date_idx').on(table.athleteId, table.date),
    // Guard columns hold closed value sets — encode them so a bad write fails at
    // the database, not silently downstream in an authority check.
    check(
      'sessions_origin_valid',
      sql`${table.origin} IN ('coach', 'athlete', 'garmin', 'head_coach')`,
    ),
    check(
      'sessions_status_valid',
      sql`${table.status} IN ('planned', 'completed', 'skipped')`,
    ),
    check(
      'sessions_feedback_body_range',
      sql`${table.feedbackBody} IS NULL OR ${table.feedbackBody} BETWEEN 1 AND 5`,
    ),
    check(
      'sessions_feedback_mind_range',
      sql`${table.feedbackMind} IS NULL OR ${table.feedbackMind} BETWEEN 1 AND 5`,
    ),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;

/**
 * The unified event stream (ticket 05, ballot 3).
 *
 * One append-only log of things that happened to an athlete's plan — a Session
 * Move, a creation, a coach action — that Week Activity and Pattern Insight read
 * later. It replaces the POC's separate move/creation logs.
 *
 * `actorType` says who acted; `actorId` is their opaque id where they have one
 * (an athlete or coach id — polymorphic, so no single foreign key) and null for
 * `system`. `narratedAt` is the un-bench hook: narration of coach actions is
 * benched for the eval (ticket 02, amended), so events are recorded with
 * attribution but nothing is announced, and this column stays null.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    type: text('type').notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    narratedAt: timestamp('narrated_at'),
  },
  (table) => [
    index('events_athlete_idx').on(table.athleteId, table.createdAt),
    check(
      'events_actor_type_valid',
      sql`${table.actorType} IN ('athlete', 'head_coach', 'coach_ai', 'system')`,
    ),
  ],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
