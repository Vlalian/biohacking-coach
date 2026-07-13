Status: done
Route position: 1 of 8 (Calendar Implementation Route)

# 01 — Sessions become entities

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

The per-session-identity refactor from ADR 0002, delivered as an invisible tracer: after this slice the calendar looks and behaves exactly as before, but every session is an identity-bearing entity in a new session store instead of a value computed from date-keyed maps.

The store owns CRUD, week/day queries, and a one-time idempotent migration of existing localStorage state into the canonical session shape (see PRD). Future weeks materialize as real stored Planned Sessions seeded from the existing phase templates — they must exist as mutable data, not render-time computation. The calendar's dot rendering, day statuses, and feedback display all read from the store.

**Decisions folded in by the Calendar Implementation Route (2026-07-12):**

- **`dayOrder` field**: the canonical entity gains an integer `dayOrder` (1-based position within its day, minted on create/drop, appended at end of day; gaps after moves are fine). Identity is the entity `id` — the old `sessionIndex`/compound-key scheme never shipped, so no compat shim is needed.
- **Migration design** (per [Decide the one-shot migration](../../calendar-implementation-route/issues/03-decide-the-one-shot-migration.md)): inputs are `bh_week_plan`, `bh_plan_history`, `bh_session_feedback` (plain date keys only — verified no compound keys exist). Status mapping: `skipped: true` → `status: 'skipped'`; `unavailable: true` → `'unavailable'`; a rating → `'completed'` with the rating in the embedded `feedback` field; plan/history records without feedback → `'planned'`. Template-era feedback (ratings on days no plan record covers) mints an entity — type from the stored `sessionType` when present, else the phase-template logic. The store mints fresh ids; `dayOrder` per day in encounter order. **Eager materialization**: the migration seeds every week in the Coach's planning horizon in one pass. Idempotency via a `bh_store_version` marker; old keys are read, never deleted or modified. Unmatched entries are counted, kept, and logged — never discarded.
- **Migration report**: a one-time dismissable notice with carried-over counts ("N sessions, N ratings, N skips…") shown to both live users after migration, translated like all UI strings; the same summary goes to the console.
- **Write-path redirect**: `agreeWeeklyPlan()` writes agreed sessions into the store (single-session semantics unchanged in this slice — multi-session extraction lands in [Weekly plan lands in the session store](../../multi-session-day/issues/04-weekly-session-multi-session-prompt.md)). This keeps the tracer invisible: after this slice nothing writes plan state the store can't see.
- **Absorbed from Multiple Sessions Per Day**: `SESSION_DEFAULTS` phase templates gain a small number of realistic two-session days (e.g. Endurance + Recovery on one day per phase) so materialized future weeks demonstrate Doubles; `getLastWeekFeedback` reads from the store.

## Acceptance criteria

- [ ] Calendar renders visually identical to before (dots, statuses, colours, past-day greying) — from the store
- [ ] Existing localStorage users keep their agreed week plan, history, and ratings after migration; running migration twice changes nothing; old keys untouched
- [ ] Migration report notice appears once with correct counts, dismissable, translated; a re-run shows nothing
- [ ] Future weeks inside the Coach's planning horizon exist as stored, queryable Planned Sessions (eager seeding)
- [ ] A seeded two-session day round-trips with `dayOrder` 1 and 2
- [ ] Agreeing a weekly plan lands sessions in the store; behavior otherwise unchanged
- [ ] Rest sessions from the Week Plan are stored as entities (they render in later slices)
- [ ] Store tests: create/query round-trips, week/day queries, migration preservation and idempotence, template-era feedback reconstruction
- [ ] Existing test suite stays green

## Blocked by

None — can start immediately.

## Resolution

Implemented 2026-07-13 (commit 6cf41e6); all acceptance criteria covered by tests, suite green.
