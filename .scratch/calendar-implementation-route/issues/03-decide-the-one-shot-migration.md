Label: wayfinder:grilling
Status: done
Assignee: claude (Mads's session, 2026-07-09)
Created: 2026-07-09
Resolved: 2026-07-09

# 03 — Decide the one-shot migration

## Question

The Draggable Calendar PRD requires an idempotent, non-destructive migration of live localStorage (Mads and the domain expert have real state) into the entity store. With the sessionIndex scheme superseded, there is exactly one migration — from today's date-keyed shapes straight to entities. Decide:

- **Inputs**: `bh_week_plan` (single session per day today), plan history, `bh_session_feedback` (plain date keys; any `"YYYY-MM-DD-{index}"` keys if Multi-Session-Day work ever partially landed — verify none exist).
- **Identity minting**: how ids are assigned to migrated sessions; how a date-keyed feedback record finds its session.
- **Materialization**: the PRD says future weeks become real stored Planned Sessions seeded from phase templates — does the migration seed them, or does the store lazily materialize on first touch?
- **Idempotency check**: what marks a store as already-migrated; what a re-run does.
- **Verification**: how the two live users confirm nothing was lost (a before/after count? a manual checklist?).

Output: the migration design recorded here, and any additions folded into the [Sessions become entities](../../draggable-calendar/issues/01-sessions-become-entities.md) issue body by the sequencing ticket.

## Resolution

Resolved with Mads, 2026-07-09.

**Inputs (verified against the code, not assumed):** `bh_week_plan` (`{weekStart, sessions: [{dayOfWeek, type, duration, zone, note}]}`, Rest included), `bh_plan_history` (flat `[{dateKey, type, duration, zone, note}]`, Rest excluded), `bh_session_feedback` (one map, plain date keys; values carry ratings *and* `skipped: true` / `unavailable: true` markers). **No compound `"YYYY-MM-DD-{index}"` keys exist** — the sessionIndex scheme never landed, so there is nothing half-migrated. Untouched by migration: `bh_athlete_profile`, `bh_equipment`, `bh_onboarded`, `bh_weekly_session_count`, language.

**The design:**

- **Status mapping**: feedback entry with `skipped: true` → entity `status: 'skipped'`; `unavailable: true` → `status: 'unavailable'`; a rating → `status: 'completed'` with the rating in the embedded `feedback` field; plan/history records without feedback → `status: 'planned'`.
- **Template-era feedback** (ratings on days no plan record covers — possible today because the calendar renders phase-template sessions before a plan is agreed): the migration mints a session entity for the day, taking the type from the feedback's stored `sessionType` when present, otherwise from the same phase-template logic that rendered it. Nothing is dropped.
- **Identity minting**: the store mints fresh ids on insert; `dayOrder` is assigned per day in migration-encounter order (single-session days → 1).
- **Materialization (Mads)**: **eager** — the migration seeds every week in the Coach's planning horizon as stored Planned Sessions in one pass. After migration, everything visible is real data; agreeing a weekly plan later overwrites that week's provisional sessions.
- **Idempotency**: a `bh_store_version` marker; migration runs only when absent/lower, and re-running is a no-op. Old keys are read, never deleted or modified (non-destructive per the PRD).
- **Verification (Mads)**: a **one-time visible migration report** — a small dismissable notice with carried-over counts ("N sessions, N ratings, N skips…") shown to both live users (Mads and the domain expert) after migration, translated like all UI strings; the same summary also goes to the console. Unmatched entries are counted, kept, and logged, never discarded.

The backlog-sequencing ticket folds this design into [Sessions become entities](../../draggable-calendar/issues/01-sessions-become-entities.md) (the migration report adds one acceptance criterion there).
