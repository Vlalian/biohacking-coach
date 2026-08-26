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
  primaryKey,
  uniqueIndex,
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
    // Optimistic concurrency. Two people write this row — the athlete and their
    // Head Coach — and until this column existed the second write silently
    // overwrote the first: both paths read, then wrote unconditionally.
    //
    // Content (type/duration/zone/title/note) and placement (`date`) are the
    // contested columns — the Head Coach's edit sets both, and a Session Move
    // sets the date — so every write to them carries the version it read and
    // lands only if the row still holds it. A stale version is refused and
    // reported, never applied (`versioned-write.ts`).
    //
    // Status toggles and Session Reflections deliberately do *not* participate:
    // they are the athlete's alone, and they touch columns no one else writes,
    // so versioning them would manufacture conflicts that cannot happen.
    version: integer('version').notNull().default(1),
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
      sql`${table.status} IN ('planned', 'completed', 'skipped', 'unavailable')`,
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

/**
 * Per-sample streams for a session, behind the session-ID seam (ticket 05,
 * ballot 2).
 *
 * Kept out of the `sessions` row on purpose: a session is small and read often,
 * a stream is large and read rarely. `samples` is the columnar shape the parser
 * emits and the calc module will consume — `{ t, hr, speedMps, altM, powerW,
 * cadenceRpm }`, arrays binned to `sampleIntervalS` seconds. JSONB now; the seam
 * is what survives a move to blob storage later without touching callers.
 *
 * Cascade-deletes with its session — the streams have no meaning without it.
 */
export const sessionStreams = pgTable('session_streams', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  samples: jsonb('samples').notNull(),
  sampleIntervalS: integer('sample_interval_s').notNull().default(10),
});

export type SessionStreamRow = typeof sessionStreams.$inferSelect;
export type NewSessionStreamRow = typeof sessionStreams.$inferInsert;

/**
 * A coach — a role you *have*, not a kind of person (route ticket 05, ballot 1).
 *
 * The row points at a better-auth user and nothing more: a coach always has a
 * login, so their name lives on `user.name` and never here (route 06 dropped
 * `display_name` for exactly that reason). Someone is a *Head Coach* only of
 * the athletes their Coaching Links point at; the same person can hold a coach
 * row and an athlete row at once without conflict.
 *
 * `informationViewLayout` is ONE layout across the whole roster (ADR 0004):
 * the coach curates their panel wall once and it applies to every athlete they
 * open.
 */
export const coach = pgTable('coach', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id),
  informationViewLayout: jsonb('information_view_layout'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type CoachRow = typeof coach.$inferSelect;
export type NewCoachRow = typeof coach.$inferInsert;

/**
 * A Coaching Link — the athlete↔Head-Coach relationship record.
 *
 * Link Visibility is two booleans, and the mapping is the contract (ticket 05,
 * amended 2026-07-17):
 *
 *   - Always on, no flag, by construction: the calendar, sessions and their
 *     parameters, statuses, and the move log. "A Head Coach who can't see the
 *     plan isn't a coach; sever the link instead." There is deliberately no
 *     calendar column to toggle (ADR 0003).
 *   - `shareAthleteReports` (default true) — what the athlete *reported about
 *     their own body*: Session Reflections, Check-in data, Athlete Profile
 *     training fields and stats. The doctor-patient asymmetry.
 *   - `shareAiTranscripts` (default false) — Coach Chat and Weekly Session
 *     transcripts. Opt-in, per the same model.
 *
 * A severed link keeps its row (`severedAt` says when) so history survives, but
 * every access path filters on `status = 'active'` — severing revokes. The
 * partial unique index lets a pair re-link after severing without colliding
 * with their own history.
 */
export const coachingLink = pgTable(
  'coaching_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    coachId: uuid('coach_id')
      .notNull()
      .references(() => coach.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('active'),
    shareAthleteReports: boolean('share_athlete_reports').notNull().default(true),
    shareAiTranscripts: boolean('share_ai_transcripts').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    severedAt: timestamp('severed_at'),
  },
  (table) => [
    check(
      'coaching_link_status_valid',
      sql`${table.status} IN ('active', 'severed')`,
    ),
    // One active link per pair; severed history does not block re-linking.
    uniqueIndex('coaching_link_active_pair_idx')
      .on(table.coachId, table.athleteId)
      .where(sql`${table.status} = 'active'`),
    // The roster reads by coach; the athlete's link list reads by athlete.
    index('coaching_link_coach_idx').on(table.coachId),
    index('coaching_link_athlete_idx').on(table.athleteId),
  ],
);

export type CoachingLinkRow = typeof coachingLink.$inferSelect;
export type NewCoachingLinkRow = typeof coachingLink.$inferInsert;

/**
 * A Coach conversation, persisted server-side (ticket 05, ballot 4).
 *
 * Every kind of Coach exchange lands here uniformly — the Weekly Session, Coach
 * Chat, MCQ onboarding, the Coach Briefing — so a refresh never loses a
 * transcript and the Briefing and the ai-transcripts toggle become real later.
 *
 * The set was six until 2026-08-18, held wide so the table would not be
 * re-migrated per slice. Two of the six turned out never to be written at all:
 * `negotiation` and `reflection` are gone (migration 0011). Session Negotiation
 * is a *behavior* inside Coach Chat carrying a Session as a Reference, not a
 * kind (CONTEXT.md, 2026-08-12); a Session Reflection is ratings on a session,
 * not a transcript. The four that remain are each written by live code.
 *
 * `athleteId` scopes a conversation to its owner. Every read and write resolves
 * that owner from the authenticated session; a client-supplied conversation id is
 * checked against it, never trusted (ADR 0006).
 *
 * `coachId` is the Briefing owner — a coach, not an athlete. The foreign key
 * landed with slice 11's coach roster, as this comment always promised.
 *
 * `weeklySessionNumber` is the 1-based ordinal that selects the Weekly Session's
 * conversational arc (Session 1 welcomes, Session 4+ reviews); null for kinds
 * that have no such arc.
 *
 * Retention and deletion of conversations are a GDPR-track question, not schema —
 * deliberately not decided here.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    coachId: uuid('coach_id').references(() => coach.id),
    weeklySessionNumber: integer('weekly_session_number'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    endedAt: timestamp('ended_at'),
  },
  (table) => [
    index('conversations_athlete_idx').on(table.athleteId, table.createdAt),
    // The four conversation kinds are a closed set — encode it so a bad write
    // fails at the database, not silently downstream.
    check(
      'conversations_kind_valid',
      sql`${table.kind} IN ('weekly_session', 'coach_chat', 'onboarding', 'coach_briefing')`,
    ),
  ],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversationRow = typeof conversations.$inferInsert;

/**
 * One message in a conversation (ticket 05, ballot 4).
 *
 * `role` says who spoke — the athlete, the Coach AI, or a Head Coach. `seq` is
 * the per-conversation ordering key: messages are read back in `seq` order so a
 * transcript is stable regardless of write timing. Cascade-deletes with its
 * conversation — a message has no meaning without one.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    seq: integer('seq').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // Read path is always "this conversation's messages in order"; index it and
    // make (conversation, seq) unique so ordering can never collide.
    uniqueIndex('messages_conversation_seq_idx').on(
      table.conversationId,
      table.seq,
    ),
    check(
      'messages_role_valid',
      sql`${table.role} IN ('athlete', 'coach_ai', 'head_coach')`,
    ),
  ],
);

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;

/**
 * An Unavailable Date — a specific day the athlete has declared they cannot
 * train (travel, work, life). Keyed by athlete and date: one row is the whole
 * fact, so the composite primary key is the natural key and marking a day twice
 * is idempotent by construction.
 *
 * Distinct from a Fixed Constraint (a recurring weekday, stored in the Athlete
 * Profile) — this is a single day. The row is passed to the next Weekly Session
 * so the Coach plans around it; the sessions that fell on the day are parked in
 * place (`sessions.status = 'unavailable'`, `parked = true`) rather than moved.
 *
 * Cascade-deletes with its athlete, like every other training table (ADR 0006 —
 * training data keys off the opaque athlete id and carries no identity).
 */
export const unavailableDates = pgTable(
  'unavailable_dates',
  {
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.athleteId, table.date] })],
);

export type UnavailableDateRow = typeof unavailableDates.$inferSelect;
export type NewUnavailableDateRow = typeof unavailableDates.$inferInsert;

/**
 * A consent record — the athlete's explicit, unbundled, versioned grant for one
 * processing purpose (the lawful basis GDPR requires; gdpr-decisions item A).
 *
 * Append-only audit trail, not a mutable flag. A grant inserts a row; a
 * withdrawal stamps `withdrawnAt` on the active row; a re-grant, or a grant made
 * under a newer disclosure version, inserts a fresh row. So the table is the
 * full history of what the athlete agreed to and when — the evidence a consent
 * regime must be able to produce — rather than a current-state boolean that
 * forgets.
 *
 * `purpose` is one processing purpose, granted on its own: the consent is
 * *unbundled*, so an athlete accepts each purpose separately instead of one
 * all-or-nothing checkbox. It is a closed set, checked at the database so a bad
 * write fails here and not silently downstream. The set mirrors
 * `CONSENT_PURPOSES` in `features/consent/disclosure.ts` — the app-side source of
 * truth; keep the two in step (a migration changes this list deliberately).
 *
 * `disclosureVersion` is the version of the disclosure text the athlete saw when
 * they granted. The gate accepts a grant only when its version equals the
 * current `DISCLOSURE_VERSION`, so revising the disclosure wording invalidates
 * every prior grant and the athlete must consent again to the new text.
 *
 * Keyed by the opaque athlete id and nothing else (ADR 0006): a consent row
 * carries no name or email, so a leak of this table alone names nobody, exactly
 * like every training table.
 *
 * The partial unique index keeps at most one *active* (un-withdrawn) row per
 * (athlete, purpose), so "is this currently granted?" has a single answer; the
 * withdrawn history is left unconstrained to accumulate.
 */
export const consent = pgTable(
  'consent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    disclosureVersion: text('disclosure_version').notNull(),
    grantedAt: timestamp('granted_at').notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at'),
  },
  (table) => [
    // The athlete's consent list — and the gate — always read by athlete.
    index('consent_athlete_idx').on(table.athleteId),
    // At most one active grant per (athlete, purpose); withdrawn rows are exempt
    // (their `withdrawn_at` is set), so history piles up freely beneath it.
    uniqueIndex('consent_active_purpose_idx')
      .on(table.athleteId, table.purpose)
      .where(sql`${table.withdrawnAt} IS NULL`),
    // Closed value set — the mirror of CONSENT_PURPOSES (see the docstring).
    check(
      'consent_purpose_valid',
      sql`${table.purpose} IN ('ai_coaching', 'health_data', 'product_improvement')`,
    ),
  ],
);

export type ConsentRow = typeof consent.$inferSelect;
export type NewConsentRow = typeof consent.$inferInsert;

/**
 * One piece of Equipment — gear the athlete trains on (CONTEXT.md: "the value
 * is the Coach knowing what the athlete trains on, not inventory management").
 * A list, not a single fixed slot: an athlete may log more than one bike or
 * pair of shoes, each as its own named row.
 *
 * `category` is the fixed catalog the Equipment screen groups by; `details` is
 * optional free text (setup, size — whatever the Coach should know). Cascade-
 * deletes with its athlete, like every other training table (ADR 0006).
 */
export const equipmentItems = pgTable(
  'equipment_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    name: text('name').notNull(),
    details: text('details'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // The Equipment screen always reads one athlete's items, oldest first.
    index('equipment_items_athlete_idx').on(table.athleteId, table.createdAt),
    check(
      'equipment_items_category_valid',
      sql`${table.category} IN ('bike', 'shoes', 'watch', 'other')`,
    ),
  ],
);

export type EquipmentItemRow = typeof equipmentItems.$inferSelect;
export type NewEquipmentItemRow = typeof equipmentItems.$inferInsert;
