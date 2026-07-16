Label: wayfinder:grilling
Status: done
Assignee: Claude + Mads (grill session 2026-07-16)

# Design the server data model

## Question

With the feature scope ([02](02-coached-mode-mvp-scope.md)), the architecture ([03](03-client-server-architecture.md)), and the DB ([04](04-hosting-db-auth-stack.md)) decided, design the shared schema (via `/domain-modeling`):

- **Accounts + roles** — athlete and Head Coach; how a single person could be both (Mads is the athlete; the coach is the coach).
- **Migration of the on-device data** — every `bh_*` key becomes server state: the entity store (`bh_sessions`), per-session streams (`bh_stream_*`), feedback, week plans, Information View layout, onboarding profile. What moves, what stays local (per the 03 hybrid line, if chosen).
- **Coaching Link** — the athlete↔coach relationship record; single-use invite vs. seeded link (per 02).
- **Link Visibility** — per-athlete, per-section sharing flags (training data default-on, AI-chat transcripts opt-in, calendar always visible) expressed relationally and enforced server-side.

Output: the schema + migration plan the build implements. Keep it a shape a real roster extends, not a two-row special case.

## Blocked by

02, 03, 04 — needs the feature scope, the architecture fork, and the DB choice. (All resolved 2026-07-16.)

## Resolution (grill session 2026-07-16, five ballots + schema sign-off, all Mads)

### Ballots

1. **Roles are things you *have*, not things you *are*** — better-auth `user` = pure login identity; `athlete` and `coach` are separate rows pointing at a user; holding both rows = being both (the coach-who-also-trains scenario costs one row; Mads can hold a coach row for dev). "Head Coach" = a relationship via Coaching Link, not a kind of person — pinned in CONTEXT.md (Head Coach entry).
2. **Streams in a separate `session_streams` table** behind the session-ID seam (the POC's `bh_sessions`/`bh_stream_<id>` split, ported). Chosen over embedded-column/row-per-sample/object-storage after a scalability briefing: the seam is what survives every scale transition — JSONB now, blob pointers behind the same seam if ever needed, Timescale only if analytics-over-samples becomes a product goal (it isn't).
3. **One unified `events` table** (actor, athlete concerned, type, JSONB payload, `narrated_at`) replacing bh_move_log + bh_creation_log and absorbing coach actions. Week Activity, Pattern Insight, and future narration are readers of one stream.
   **Same session: narration of Head Coach actions BENCHED for the eval** (ticket 02 resolution amended in place) — audit half survives (events recorded with attribution), announcement half waits for the coach interview; `narrated_at` stays as the cheap un-bench hook.
4. **Conversations persist server-side, uniformly** — all six kinds (weekly session, coach chat, negotiation, reflection, onboarding, coach briefing) in `conversations` + `messages`. Fixes refresh-amnesia, makes the Briefing and the ai-transcripts visibility toggle real, enables future Coach memory. Retention/deletion = GDPR-track question, not schema.
5. **No browser migration — the localStorage era ends with the POC.** Mads confirmed nothing important lives in his browser (real .fit upload was still an open to-do). Fresh start through the real flows (onboarding, Garmin upload) is better eval evidence anyway. GDPR portability export = future *server-side* feature; synthetic seeding = seed script.

### Schema (signed off)

**Identity (better-auth owns, Drizzle adapter, UUIDs):** `user`, auth `session`, `account`, `verification`. No training table references these directly (ADR 0006 identity separation).

- **`athlete`** — `id` (opaque UUID, the key ALL training data uses), `user_id` FK → user, **nullable** (synthetic athletes = athlete rows with no login), `display_name` (athlete-chosen), `phase`, `experience_level`, `comm_style`, `race_target`, `weekly_session_count`, `profile` JSONB (onboarding answers), `equipment` JSONB, `info_layout` JSONB (favorites/order/range), timestamps.
- **`coach`** — `id` UUID, `user_id` FK unique, `display_name`, `info_layout` JSONB (ONE layout across roster, per ADR 0004).
- **`coaching_link`** — `id`, `coach_id` FK, `athlete_id` FK, `status` (active|severed), `share_training_data` bool default true, `share_ai_transcripts` bool default false, `created_at`, `severed_at`. **No calendar flag by construction** (always visible, ADR 0003). Unique active pair. Seeded for the eval; invite flow later creates the same row.
- **`sessions`** — POC entity ported: `id`, `athlete_id` FK, `date`, `type`, **`origin` (coach|athlete|garmin|head_coach)** — Prescribed Session = origin `head_coach`; all ticket-02 authority rules are guards on this column (same pattern as the garmin guards) — `status` (planned|completed|skipped), `parked`, `is_training`, `duration`, `zone`, `note`, `title`, `day_order`, Garmin provenance (`start_time`, `sport`, `summary` JSONB), feedback as columns (`feedback_body` 1–5, `feedback_mind` 1–5, `feedback_comment`, `rated_at`), timestamps.
- **`session_streams`** — `session_id` PK/FK cascade-delete, `samples` JSONB (columnar `{t,hr,speedMps,altM,powerW,cadenceRpm}` — the calc-module contract), `sample_interval_s` default 10.
- **`unavailable_dates`** — `athlete_id` + `date` (Displacement parking).
- **`events`** — `id`, `athlete_id` FK, `actor_type` (athlete|head_coach|coach_ai|system), `actor_id` nullable, `type` (session_moved, session_created, session_prescribed, session_edited, garmin_imported, plan_agreed, …), `payload` JSONB, `created_at`, `narrated_at` nullable (benched).
- **`conversations`** — `id`, `athlete_id` FK, `kind` (weekly_session|coach_chat|negotiation|reflection|onboarding|coach_briefing), `coach_id` FK nullable (briefing owner), `weekly_session_number` nullable, `created_at`, `ended_at`.
- **`messages`** — `id`, `conversation_id` FK cascade, `role` (athlete|coach_ai|head_coach), `content`, `seq`, `created_at`.

UI language pref lives with the user (`ui_prefs` JSONB on user or better-auth's additional-fields mechanism — build detail). Deliberately absent: RAG/Knowledge Oracle tables (separate project; pgvector ready in Neon), notifications, invite codes, payments — all addable without reshaping this.

**Seed script (replaces migration):** Mads user + athlete row; coach user + coach row (+ optionally a coach row for Mads, dev); one active coaching_link; shallow synthetic athletes (no user_id) with sparse contrast-giving sessions per ticket 02.
