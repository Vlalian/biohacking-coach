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
  vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth-schema';
import { CONVERSATION_KINDS } from '@/lib/conversation-kinds';
import { RACE_DISTANCES } from '@/lib/race-distances';
import { ALLOWANCES } from '@/features/health/capacity';
import { CONSENT_PURPOSES } from '@/features/consent/disclosure';
import type { Citation } from '@/lib/citation';

/**
 * A closed set as a SQL literal list, for a CHECK constraint.
 *
 * `sql.raw` rather than a bound parameter on purpose: this string is rendered
 * into DDL by `drizzle-kit generate`, where a placeholder has nothing to bind
 * to. The inputs are module constants, never anything a request can reach.
 */
function quotedList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

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
 * Column names follow the glossary exactly (route 07): `training_sessions_per_week`,
 * not the misleading `weekly_session_count` (a "Weekly Session" is the once-a-week
 * Coach ritual — there is only ever one).
 *
 * There is deliberately **no stored Training Phase column**. The phase is the
 * name of the Training Block today falls inside, derived on every read from the
 * Target Race (`training-architecture/03`). It used to be a string written once
 * at onboarding and never recomputed, so an athlete who onboarded eleven months
 * out was still `Base Building` in race week — and every Coach prompt read that
 * as fact. `race/no-date-guessing.test.ts` is the guard that keeps it derived.
 */
export const athlete = pgTable(
  'athlete',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .unique()
      .references(() => user.id),
    syntheticLabel: text('synthetic_label'),
    experienceLevel: text('experience_level'),
    communicationStyle: text('communication_style'),
    raceTarget: text('race_target'),
    /**
     * The Race Distance the athlete trains for, independent of whether they
     * have a race booked (`training-architecture/02`). Nullable because every
     * athlete who onboarded before this column existed was never asked — and the
     * migration deliberately backfills nothing: a distance is not derivable from
     * `race_target`'s free text, and guessing one from prose is exactly the
     * habit this slice removed. The prompt says the distance is unknown instead.
     */
    raceDistance: text('race_distance'),
    /**
     * Hours a week the athlete can realistically train, asked in onboarding
     * and never suggested (`training-architecture/35`, Mads 2026-09-19: "A and
     * only A"). Null for anyone who onboarded before the question existed —
     * never asked, not zero — and 34's arithmetic treats null as "not
     * fillable" rather than guessing. The ceiling every week is sized within.
     */
    hoursPerWeek: integer('hours_per_week'),
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
    // Why a parked session is parked. An Unavailable *Date* parks the day's
    // planned training and names the day here; the session-level Unavailable
    // toggle parks too but leaves this null. Clearing a date restores only the
    // rows that name it, so the athlete's own per-session decision survives the
    // day being marked and cleared around it (code-health issue 12). Null on a
    // parked row means session-parked, which is also what every row parked
    // before this column existed reads as — the conservative reading: nothing
    // un-parks that the athlete did not ask to.
    parkedByDate: date('parked_by_date', { mode: 'string' }),
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
 * A Detected Activity waiting for the athlete — an uploaded activity that has
 * been parsed and reconciled against the Week Plan, and has not yet been
 * accepted.
 *
 * This table exists so that detection can propose without asserting
 * (`CONTEXT.md`, Detected Activity). The import used to insert a completed
 * session per activity, which broke that rule three ways at once: it wrote
 * `completed` with no athlete in between, it never matched the Week Plan so a
 * planned ride and its upload became two entries for one ride, and it froze
 * the result where the athlete could not delete it (showable-version/14).
 *
 * Holding the proposal *outside* `sessions` is the point. A declined proposal
 * leaves nothing behind because nothing was ever written, rather than because
 * a cleanup path remembered to delete it — and no query that reads the
 * training record has to learn to filter proposals out. The activity's own
 * data lives here until it is accepted, at which point it moves into the
 * matched session (or a new Athlete Session) and this row is gone.
 *
 * `matchedSessionId` is the Planned Session this proposes to complete, decided
 * at import by `matchActivities`. It is re-checked on accept: the athlete may
 * have moved, skipped or completed that session in between, and a stale match
 * degrades to the retro-log offer rather than writing to the wrong session. On
 * delete it goes null for the same reason.
 */
export const detectedActivities = pgTable(
  'detected_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    type: text('type').notNull(),
    sport: text('sport'),
    duration: integer('duration'),
    note: text('note'),
    startTime: timestamp('start_time'),
    summary: jsonb('summary'),
    samples: jsonb('samples').notNull(),
    matchedSessionId: uuid('matched_session_id').references(() => sessions.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // Always read as "everything pending for this athlete", newest day first.
    index('detected_activities_athlete_date_idx').on(table.athleteId, table.date),
  ],
);

export type DetectedActivityRow = typeof detectedActivities.$inferSelect;
export type NewDetectedActivityRow = typeof detectedActivities.$inferInsert;

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
 * landed with slice 11's coach roster, as this comment always promised. It
 * cascades since 2026-08-27 (`showable-version/10`), and that is load-bearing
 * rather than tidy: without it a Head Coach account could not be deleted at all.
 * A Briefing carries `coachId` = the coach and `athleteId` = *the athlete it is
 * about*, so a coach's briefings about other athletes are keyed to those
 * athletes' ids and survive the coach's own erasure — leaving the coach row
 * referenced and the DELETE throwing. Erasing a coach now takes their briefings
 * with them, which is right: a briefing is that coach's account of their own
 * coaching.
 *
 * `weeklySessionNumber` was the 1-based ordinal that selected the Weekly
 * Session's conversational arc. The behaviour is retired
 * (`training-architecture/21`); the column stays for old `weekly_session`
 * rows and is null on everything written since.
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
    coachId: uuid('coach_id').references(() => coach.id, { onDelete: 'cascade' }),
    weeklySessionNumber: integer('weekly_session_number'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    endedAt: timestamp('ended_at'),
  },
  (table) => [
    index('conversations_athlete_idx').on(table.athleteId, table.createdAt),
    // The conversation kinds are a closed set — encoded here so a bad write
    // fails at the database, not silently downstream. Built from
    // {@link CONVERSATION_KINDS} in `lib/conversation-kinds.ts` rather than
    // repeating the list: `ConversationKind` is that same constant, so the
    // type and the constraint cannot drift apart. They used to be two lists that
    // had to be edited together, and three tickets in a row noted it.
    check(
      'conversations_kind_valid',
      sql`${table.kind} IN (${sql.raw(quotedList(CONVERSATION_KINDS))})`,
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
    /**
     * The sources the Coach drew on for this turn, stored with the message so it
     * re-renders identically when the athlete scrolls back a week later - a
     * reference that vanishes on reload is not evidence of anything
     * (code-health/06).
     *
     * A column rather than its own table: a reference list is only ever read
     * with its message and never queried across messages, so a join buys
     * nothing. Null on every athlete turn and on every message written before
     * this existed.
     */
    citations: jsonb('citations').$type<Citation[]>(),
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

/** The two kinds of row {@link athleteFeedback} holds. */
export const ATHLETE_FEEDBACK_KINDS = ['fallback', 'trust_signal'] as const;

/**
 * The two things a Feedback Interview produces that are **not** conversation
 * turns (`showable-version/07`).
 *
 * The interview transcript itself lives in `conversations`/`messages` like every
 * other conversation — this table is deliberately not a second transcript store.
 * It holds:
 *
 * - `fallback` — text submitted through the plain textarea that sits beside the
 *   interview. The escape hatch can never hard-depend on a model call, because a
 *   tester whose Coach is broken is the tester with the most to say. A row of
 *   this kind therefore *is* the signal that the model could not answer someone,
 *   which is why `coachFailureReason` hangs off it rather than being logged and
 *   forgotten.
 * - `trust_signal` — the answer to "would you have done something different if
 *   you'd decided alone?", which `CONTEXT.md` calls the single most valuable
 *   qualitative data point. Asked once, near the end, inside the interview.
 *
 * Keyed to the opaque athlete id and nothing else: no name, no email, no user
 * id. The cascade is load-bearing rather than tidy — it is what puts this table
 * inside erasure, and `features/erasure/erasure-schema.test.ts` asserts it by
 * walking the schema, so forgetting it fails a test that already exists.
 *
 * Nothing here is ever shown to a Head Coach or scored back to the athlete.
 */
export const athleteFeedback = pgTable(
  'athlete_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    body: text('body').notNull(),
    /** The View the tester was on when they reached the escape hatch; null from the interview. */
    view: text('view'),
    /** The interview this answer came from; null for a fallback submission, which has no conversation. */
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    /** Why the Coach could not answer, for a `fallback` row. Null when the tester simply chose the box. */
    coachFailureReason: text('coach_failure_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('athlete_feedback_athlete_idx').on(table.athleteId, table.createdAt),
    check(
      'athlete_feedback_kind_valid',
      sql`${table.kind} IN (${sql.raw(quotedList(ATHLETE_FEEDBACK_KINDS))})`,
    ),
    // One Trust Signal answer per athlete. The question is asked once by
    // construction (`trustSignalState`); this is the database refusing to
    // let a second answer overwrite the first if it ever is asked twice.
    uniqueIndex('athlete_feedback_trust_signal_once')
      .on(table.athleteId)
      .where(sql`${table.kind} = 'trust_signal'`),
  ],
);

export type AthleteFeedbackRow = typeof athleteFeedback.$inferSelect;
export type NewAthleteFeedbackRow = typeof athleteFeedback.$inferInsert;

/**
 * An Unavailable Date — a specific day the athlete has declared they cannot
 * train (travel, work, life). Keyed by athlete and date: one row is the whole
 * fact, so the composite primary key is the natural key and marking a day twice
 * is idempotent by construction.
 *
 * Distinct from a Fixed Constraint (a recurring weekday, stored in the Athlete
 * Profile) — this is a single day. The row is passed to the next Weekly Session
 * so the Coach plans around it; the sessions that fell on the day are parked in
 * place (`sessions.status = 'unavailable'`, `parked = true`,
 * `parked_by_date = <the day>`) rather than moved. Clearing the day restores
 * only the rows that name it.
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
 * A Race — an entity from the start, not two columns on the athlete
 * (`training-architecture/02`).
 *
 * An athlete has **zero or more**, and at most one is the current **Target
 * Race**. Zero is a real state: "ready to start the next block" is as valid a
 * goal as a start line, and onboarding stores that as a decision rather than as
 * an absent answer. Managing several races is slice 09; this table is the shape
 * that slice needs, landed now because building it as columns would have cost a
 * migration later for something already decided.
 *
 * `date` is a real date column, never prose. The Training Phase used to be
 * derived by running four regexes over the athlete's free-text race *name* — an
 * ISO date, "Month YYYY", `dd/mm/yyyy`, and a bare year assumed to be mid-June —
 * with a silent fallback when none matched, so an athlete who typed a race with
 * no year has had a wrong phase since onboarding with nothing to show why.
 *
 * `distance` mirrors `RACE_DISTANCES` in `features/onboarding/onboarding-flow.ts`,
 * checked at the database so a bad write fails here rather than silently
 * downstream — the same treatment `consent.purpose` gets, and for the same
 * reason. Note it is *also* on the athlete: the athlete's Race Distance is what
 * shapes their week whether or not a race exists, and a race carries its own
 * because a future race may be a different distance from the one being trained
 * for today.
 *
 * The partial unique index allows at most one Target Race per athlete, so "which
 * race are they pointed at?" has a single answer. Being the target is a property
 * that rotates as races pass, not a permanent one.
 *
 * Keyed by the opaque athlete id and nothing else (ADR 0006).
 */
export const race = pgTable(
  'race',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    distance: text('distance').notNull(),
    isTarget: boolean('is_target').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    check(
      'race_distance_known',
      sql.raw(`distance IN (${quotedList(RACE_DISTANCES)})`),
    ),
    uniqueIndex('race_one_target_per_athlete')
      .on(table.athleteId)
      .where(sql`${table.isTarget}`),
    index('race_athlete_date').on(table.athleteId, table.date),
  ],
);

export type RaceRow = typeof race.$inferSelect;
export type NewRaceRow = typeof race.$inferInsert;

/**
 * A race the athlete has already finished (`training-architecture/35`) — the
 * list that replaced "how many Ironmans have you done?". One row per race:
 * distance from the closed set, the date, an optional finish time in seconds,
 * an optional note. The experience level is derived from how many there are;
 * nothing else reads them yet (finish-time pacing is ticket 11).
 *
 * The note is the athlete's own words about a race and reaches no prompt
 * today; keyed by the opaque athlete id and nothing else (ADR 0006).
 */
export const pastRace = pgTable(
  'past_race',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    distance: text('distance').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    finishSeconds: integer('finish_seconds'),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    check('past_race_distance_known', sql.raw(`distance IN (${quotedList(RACE_DISTANCES)})`)),
    check('past_race_finish_positive', sql`${table.finishSeconds} IS NULL OR ${table.finishSeconds} > 0`),
    index('past_race_athlete_date').on(table.athleteId, table.date),
  ],
);

export type PastRaceRow = typeof pastRace.$inferSelect;
export type NewPastRaceRow = typeof pastRace.$inferInsert;

/**
 * The adjusted Training Blocks for one race (`training-architecture/07`).
 *
 * Stage 1's arithmetic draft is derived on every read and stored nowhere; this
 * is what stages 2 and 3 write once the Coach (or a Head Coach) has decided what
 * the blocks are *for*. One row per (athlete, race): the unique index is the
 * whole concurrency story for the Coach's background draft — two runs racing to
 * draft the same horizon both INSERT, one loses on the index and writes nothing
 * more.
 *
 * `blocks` is JSONB rather than a child table — an ordered list of
 * `{ name, endDate, authoredBy }` — because the set is edited and validated as
 * one thing: one row, one CAS on `version`, one unique index, one pure validator
 * (`training-blocks.ts:validateBlockSet`). The same reasoning as `events.payload`
 * and `session_streams.samples`. The first block's start is `start_date`; every
 * other start is derived, so contiguity cannot be stored wrong.
 *
 * `version` is the Head Coach's optimistic-concurrency token (slice 08): an edit
 * carries the version it read and matches zero rows if the set changed under it.
 */
export const trainingBlockSet = pgTable(
  'training_block_set',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    raceId: uuid('race_id')
      .notNull()
      .references(() => race.id, { onDelete: 'cascade' }),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    blocks: jsonb('blocks').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('training_block_set_one_per_race').on(table.athleteId, table.raceId),
  ],
);

export type TrainingBlockSetRow = typeof trainingBlockSet.$inferSelect;
export type NewTrainingBlockSetRow = typeof trainingBlockSet.$inferInsert;

/**
 * A Check-in — how the athlete arrives at the week
 * (`training-architecture/05`, CONTEXT.md).
 *
 * **Once per week, not daily.** `weekStart` is the Monday the Check-in belongs
 * to, and the unique index on (athlete, week) is what makes "once" a database
 * rule rather than a convention. A second Check-in for the same week replaces
 * the first: an athlete correcting Monday's answer on Tuesday is editing one
 * report, not filing two.
 *
 * **All three scores are NOT NULL, together.** Half a Check-in is not a
 * Check-in — a partial one would render as no readiness at all *and* have the
 * prompt tell the model there is none, a false claim in the opposite direction
 * (`code-health/07`). The database refuses it rather than trusting the form.
 *
 * `notableSignal` is free text and deliberately **not** a score: "tweaked my
 * calf on Thursday" is not a number, and forcing it into one would lose the only
 * part of a Check-in the athlete writes in their own words. It reaches a prompt,
 * so it passes the same identifier assertion every other free-text leaf does.
 *
 * Sleep *duration* and resting heart rate are absent on purpose. They are
 * expected from a device rather than a weekly question (Mads, 2026-09-09), and
 * until there is a feed the Coach is told it cannot see them.
 *
 * Keyed by the opaque athlete id and nothing else (ADR 0006).
 */
export const checkIns = pgTable(
  'check_in',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    energy: integer('energy').notNull(),
    body: integer('body').notNull(),
    sleepQuality: integer('sleep_quality').notNull(),
    notableSignal: text('notable_signal'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('check_in_once_per_week').on(table.athleteId, table.weekStart),
    check(
      'check_in_scores_in_range',
      sql`${table.energy} BETWEEN 1 AND 10 AND ${table.body} BETWEEN 1 AND 10 AND ${table.sleepQuality} BETWEEN 1 AND 10`,
    ),
  ],
);

export type CheckInRow = typeof checkIns.$inferSelect;
export type NewCheckInRow = typeof checkIns.$inferInsert;

/**
 * An Injury — the app's first model of the athlete's body
 * (`training-architecture/04`, [ADR 0011](../../docs/adr/0011-an-injury-is-split-by-who-reads-it.md)).
 *
 * **No scheduled end.** An injury cannot be planned to finish, so `closedAt` is
 * nullable and stays null until the athlete says it is over. There is
 * deliberately no `expectedEnd` column for anyone to fill in: the plan reacts to
 * an injury, it does not plan around one.
 *
 * **What it prevents lives here; what it *is* does not.** The three allowance
 * columns are the athlete's own statement of capacity — "can't run", "can ride
 * easy, not hard" — and they are the **only** part of a health record that ever
 * reaches a Coach prompt. There is no body-location column, and that absence is
 * load-bearing: "left knee" does not imply running is out, and making that leap
 * is a clinical inference on the OUT side of the posture ruling. Anything a
 * human needs to know goes in `health_note`, which the prompt path cannot read.
 *
 * Keyed by the opaque athlete id and nothing else (ADR 0006).
 */
export const injuries = pgTable(
  'injury',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    swim: text('swim').notNull().default('full'),
    bike: text('bike').notNull().default('full'),
    run: text('run').notNull().default('full'),
    /**
     * A short name for what and where — "left knee" — so the drawer and the
     * calendar can tell two injuries apart (Mads, 2026-09-18, showable-
     * version/28a). The injury's name, never the athlete's: ADR 0006 keeps
     * every training table free of who. Optional, and **for human eyes only** like the thread and
     * the Bother Rating: a body part is not a capacity, and the planner reads
     * capacity. Nothing on a prompt path reads it.
     */
    name: text('name'),
    openedAt: timestamp('opened_at').notNull().defaultNow(),
    closedAt: timestamp('closed_at'),
    /**
     * The **Bother Rating** (`training-architecture/06`, Mads 2026-09-11): an
     * optional 1–5 answer to "how much is it bothering you today?". **For human
     * eyes only** — the athlete's and the Head Coach's — never a planner input
     * and never read on a prompt path: the planner reads capacity, and a number
     * cannot say whether swimming is fine. Sits on ADR 0011's detail-thread
     * side; `detail-thread-never-prompts.test.ts` pins that nothing on the
     * prompt path names this column. 1–5 to match every other scale the athlete
     * meets (Session Reflection, Check-in). Slices 04/10 ruled out a *severity*
     * dial; this is not one.
     */
    bother: integer('bother'),
  },
  (table) => [
    check(
      'injury_allowances_known',
      sql.raw(
        `swim IN (${quotedList(ALLOWANCES)}) AND bike IN (${quotedList(ALLOWANCES)}) AND run IN (${quotedList(ALLOWANCES)})`,
      ),
    ),
    check('injury_bother_range', sql`${table.bother} IS NULL OR ${table.bother} BETWEEN 1 AND 5`),
    index('injury_athlete_open').on(table.athleteId, table.closedAt),
  ],
);

export type InjuryRow = typeof injuries.$inferSelect;
export type NewInjuryRow = typeof injuries.$inferInsert;

/**
 * An Illness — systemic, and so carries **no per-discipline capacity**.
 *
 * A separate table rather than a flag on `injury`, because it is a different
 * concept and not a severity dial: an Injury is worked around, an Illness
 * removes every discipline together. Giving them one table would mean a
 * nullable capacity that means "all of it" for half the rows, and the first
 * reader to forget that would plan an ill athlete a swim.
 *
 * Like an Injury it has no scheduled end.
 */
export const illnesses = pgTable(
  'illness',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    openedAt: timestamp('opened_at').notNull().defaultNow(),
    closedAt: timestamp('closed_at'),
    /**
     * The **Bother Rating** (`training-architecture/06`, Mads 2026-09-11): an
     * optional 1–5 answer to "how much is it bothering you today?". **For human
     * eyes only** — the athlete's and the Head Coach's — never a planner input
     * and never read on a prompt path: the planner reads capacity, and a number
     * cannot say whether swimming is fine. Sits on ADR 0011's detail-thread
     * side; `detail-thread-never-prompts.test.ts` pins that nothing on the
     * prompt path names this column. 1–5 to match every other scale the athlete
     * meets (Session Reflection, Check-in). Slices 04/10 ruled out a *severity*
     * dial; this is not one.
     */
    bother: integer('bother'),
  },
  (table) => [
    check('illness_bother_range', sql`${table.bother} IS NULL OR ${table.bother} BETWEEN 1 AND 5`),
    index('illness_athlete_open').on(table.athleteId, table.closedAt),
  ],
);

export type IllnessRow = typeof illnesses.$inferSelect;
export type NewIllnessRow = typeof illnesses.$inferInsert;

/**
 * The detail thread — free text, written by the athlete **and** the Head Coach,
 * and it **never enters a prompt, ever** (ADR 0011).
 *
 * This is where body location, what a physio said, and how it is going belong.
 * It is documentation for humans, and the guarantee is kept structurally rather
 * than by discipline: nothing on the prompt path reads this table, and
 * `features/health/capacity.ts` — the module that produces the prompt-facing
 * value — has no field for it in its input type.
 *
 * The hazard being avoided is precise. `narration.ts` already refuses to send a
 * Head Coach's session note to the model, because the sentence lands in the
 * Coach Chat transcript and `toApiMessages` replays that transcript on every
 * later turn — so one note sits in front of the model for the rest of that
 * athlete's history. This is that same hazard carrying special-category data.
 *
 * Exactly one of `injuryId` / `illnessId` is set, checked at the database.
 */
export const healthNotes = pgTable(
  'health_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    injuryId: uuid('injury_id').references(() => injuries.id, { onDelete: 'cascade' }),
    illnessId: uuid('illness_id').references(() => illnesses.id, { onDelete: 'cascade' }),
    authorRole: text('author_role').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    check(
      'health_note_one_subject',
      sql`(${table.injuryId} IS NULL) <> (${table.illnessId} IS NULL)`,
    ),
    check('health_note_author_known', sql.raw(`author_role IN ('athlete', 'head_coach')`)),
    index('health_note_injury').on(table.injuryId),
    index('health_note_illness').on(table.illnessId),
  ],
);

export type HealthNoteRow = typeof healthNotes.$inferSelect;
export type NewHealthNoteRow = typeof healthNotes.$inferInsert;

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
      // RENDERED from `CONSENT_PURPOSES` rather than retyped. It used to be a
      // hand-written list beside a docstring asking the reader to keep the two
      // in step — which is a promise, and `training-architecture/12` is the
      // change that would have broken it: a purpose added in TypeScript and
      // forgotten here fails at runtime for a real athlete, not in a test.
      sql.raw(`purpose IN (${quotedList(CONSENT_PURPOSES)})`),
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

/**
 * What survives an erasure — and the one table here that is **deliberately not
 * keyed to anybody** (`showable-version/10`, decided 2026-08-27).
 *
 * **Do not add an `athlete_id`, a `user_id`, or any foreign key to this table.**
 * Every other table in this schema hangs off `athlete.id`, so the instinct on
 * reading this one is that a key was forgotten. It was not. The whole purpose is
 * to record *that* an account consented to a set of purposes and was then erased,
 * while carrying nothing that could say whose account it was. A key here would
 * undo the erasure it exists to document. `erasure.test.ts` asserts the entry's
 * keys, so the rule is enforced rather than merely written down.
 *
 * Why it exists at all: Article 7(1) asks a controller to be able to demonstrate
 * that consent was given. Erasing the consent rows destroys that proof; retaining
 * them keeps a record about someone who asked to be forgotten. This is the third
 * option — the demonstrable fact without the person attached. It also makes the
 * erasure *itself* auditable, which letting the cascade take the consent rows in
 * silence does not.
 *
 * That this works rests on ADR 0006: `consent` was already keyed on the opaque
 * athlete id and carried no name or email, so once the `athlete` and `user` rows
 * are gone the re-identification key has been destroyed by the erasure itself.
 *
 * Append-only. Nothing in the app reads it — it is read by a human, from the
 * database, when someone has a reason to ask. Recorded in `gdpr-decisions.md`
 * for the privacy review; a design decision written down for a lawyer to check,
 * not legal advice.
 */
export const erasureLog = pgTable('erasure_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  /**
   * Each purpose that was active at erasure, with the disclosure version it was
   * granted under. Each keeps its own version rather than being collapsed to
   * one: `grantConsent` supersedes only the purpose being granted, so an
   * optional purpose granted under an older disclosure stays active at that
   * older version while the required ones move forward.
   */
  consentedPurposes: jsonb('consented_purposes').notNull(),
  /** The disclosure version in force at the moment of erasure — what dates the record. */
  disclosureVersion: text('disclosure_version').notNull(),
  erasedAt: timestamp('erased_at').notNull().defaultNow(),
});

export type ErasureLogRow = typeof erasureLog.$inferSelect;
export type NewErasureLogRow = typeof erasureLog.$inferInsert;

/**
 * ── The Knowledge Oracle corpus ──────────────────────────────────────────────
 *
 * Two tables that touch **nothing** in the training schema above. No athlete id,
 * no foreign key into an athlete row, no column that could carry one. That is
 * structural, not stylistic: the corpus is published training science, not
 * athlete data, and ADR 0006's promise ("a leak of the training data alone names
 * nobody") is not weakened by adding a table that names Mujika. The reverse rule
 * matters more — an athlete's query must never be persisted alongside a chunk,
 * so there is nowhere here for it to go.
 *
 * Deferred deliberately in route ticket 05 ("separate project; pgvector ready in
 * Neon"); that deferral ended when the Knowledge Oracle PRD put the RAG on the
 * critical path (Decision 3, 2026-08-16).
 */

/**
 * One admitted source, and the licence that admits it.
 *
 * The licence lives here rather than only in `corpus.md` because `corpus.md` is
 * gitignored prose: a retrieved passage has to be able to answer "what am I
 * allowed to do with you?" without a human opening a document that may not exist
 * on the machine asking. `attribution` is the CC BY credit line, stored ready to
 * display — a citation should never have to be assembled at read time from
 * fields that might be null.
 *
 * `textDigest` is what makes re-ingestion cheap and safe: unchanged source text
 * means the same digest, which means the chunks already in the database are
 * still correct and no embedding call needs to be paid for.
 */
export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The manifest's key. Unique so ingest can upsert on it rather than
    // guessing whether a source is already present.
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    authors: text('authors').notNull(),
    year: integer('year').notNull(),
    doi: text('doi'),
    pmcid: text('pmcid'),
    licence: text('licence').notNull(),
    licenceUrl: text('licence_url').notNull(),
    attribution: text('attribution').notNull(),
    /** SHA-256 of the source text this row's chunks were built from. */
    textDigest: text('text_digest').notNull(),
    ingestedAt: timestamp('ingested_at').notNull().defaultNow(),
  },
  (table) => [
    // A source with no licence recorded is exactly what the register exists to
    // prevent, so the database refuses it too. Belt to the manifest's braces:
    // `admit()` can be bypassed by a direct insert; this cannot.
    check('knowledge_sources_licence_present', sql`length(${table.licence}) > 0`),
  ],
);

export type KnowledgeSourceRow = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSourceRow = typeof knowledgeSources.$inferInsert;

/**
 * One retrievable passage.
 *
 * `embedding` is `vector(1536)`, the dimensionality of OpenAI's
 * `text-embedding-3-small` (decided 2026-08-21). The number is baked into the
 * migration, so changing embedding model later is a migration and a re-ingest,
 * not a config edit — stated here so nobody discovers it at the wrong moment.
 *
 * `ordinal` keeps a chunk resolvable back to its place in the article, which is
 * what lets a citation say *where* in a paper a claim came from rather than only
 * which paper.
 */
export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    tokenEstimate: integer('token_estimate').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  },
  (table) => [
    // Retrieval (issue 03) searches by cosine distance. HNSW over IVFFlat
    // because IVFFlat's recall depends on a list count tuned to a row count the
    // corpus does not have yet — eight sources is far too few to tune against,
    // and HNSW needs no such parameter to behave.
    index('knowledge_chunks_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    // Re-ingest deletes a source's chunks and rewrites them; this is the read.
    uniqueIndex('knowledge_chunks_source_ordinal_idx').on(
      table.sourceId,
      table.ordinal,
    ),
  ],
);

export type KnowledgeChunkRow = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunkRow = typeof knowledgeChunks.$inferInsert;

/** The two ways a tester can flag a Coach message. */
export const MESSAGE_RATINGS = ['up', 'down'] as const;
export type MessageRating = (typeof MESSAGE_RATINGS)[number];

/**
 * A tester's thumbs on one Coach message (`showable-version/05`, item 3).
 *
 * The artifact-pinning half of the feedback instrumentation. Testers try the app
 * unattended, which means nobody can ask "what just happened?" - so a flag has
 * to pin itself to something readable afterwards. "The Coach felt off sometimes"
 * is unactionable; this message, thumbs down, opens the transcript at the exact
 * text. The thumbs say *where*; the Feedback Interview says *why*.
 *
 * A table of its own rather than a kind on `athlete_feedback`: that one is keyed
 * by athlete with a partial unique index for the Trust Signal, and this is keyed
 * by message. Different artifact, different key.
 *
 * `athleteId` is denormalised deliberately. It scopes every read without joining
 * through `conversations`, and it is what erasure cascades from - a message
 * cascade alone would leave the row alive until the conversation went.
 */
export const messageFeedback = pgTable(
  'message_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id, { onDelete: 'cascade' }),
    rating: text('rating').notNull(),
    /** The tester's optional one line. Athlete free text: never reaches a prompt. */
    comment: text('comment'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // One flag per message, changeable. Enforced by the schema and not only by
    // the service, so a second write updates rather than accumulating a history
    // nobody asked for.
    uniqueIndex('message_feedback_message_once').on(table.messageId),
    check(
      'message_feedback_rating_valid',
      sql`${table.rating} IN (${sql.raw(quotedList(MESSAGE_RATINGS))})`,
    ),
  ],
);
